import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Queue } from "bullmq";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { getPrismaClient, isUniqueConstraintViolation } from "@ai-marketing-manager/domain";
import { generateRequestId } from "@ai-marketing-manager/config";
import { errorEnvelope, successEnvelope } from "@ai-marketing-manager/contracts";
import {
  createQueue,
  CLERK_WEBHOOK_EVENT_JOB_NAME,
  type ClerkWebhookEventPayload,
} from "@ai-marketing-manager/queue";
import type { ApiEnv } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The exact raw request body bytes, captured by app.ts's content-type parser —
     *  required for webhook signature verification, which HMACs the literal payload text,
     *  not a re-serialized parsed object. */
    rawBody?: string;
  }
}

export interface WebhooksClerkRouteOptions {
  env: ApiEnv;
}

let webhookQueue: Queue | undefined;
function getWebhookQueue(redisUrl: string): Queue {
  webhookQueue ??= createQueue("webhook", redisUrl);
  return webhookQueue;
}

/**
 * `POST /webhooks/clerk` — identity-sync.md §2. Public route (excluded from any
 * authenticated-route expectation; Clerk cannot present a session to its own webhook
 * caller), authenticated instead by Clerk's own request signature. Verifies, persists a
 * minimal idempotency envelope, enqueues for asynchronous processing, and fast-acknowledges
 * — never processes inline, never trusts an unverified payload.
 */
export default async function webhooksClerkRoute(
  app: FastifyInstance,
  opts: WebhooksClerkRouteOptions,
) {
  app.post("/webhooks/clerk", async (request, reply) => {
    if (!opts.env.CLERK_WEBHOOK_SIGNING_SECRET) {
      // No signing secret configured (e.g. this repo's own CI) — there is no way to verify
      // authenticity, so every request is rejected rather than trusted by default.
      reply
        .code(503)
        .send(
          errorEnvelope(
            "PROVIDER_UNAVAILABLE",
            "Webhook processing is not configured.",
            request.requestId,
          ),
        );
      return;
    }

    let event;
    try {
      event = await verifyWebhook(toWebRequest(request), {
        signingSecret: opts.env.CLERK_WEBHOOK_SIGNING_SECRET,
      });
    } catch (error) {
      request.log.warn(
        { err: error instanceof Error ? error.message : error },
        "clerk webhook signature verification failed",
      );
      reply
        .code(400)
        .send(errorEnvelope("VALIDATION_ERROR", "Invalid webhook signature.", request.requestId));
      return;
    }

    const eventId = request.headers["svix-id"];
    if (typeof eventId !== "string" || eventId.length === 0) {
      // Standard Webhooks always sets this; its absence means verifyWebhook's own
      // signature check should already have failed above — defensive, should be
      // unreachable in practice.
      reply
        .code(400)
        .send(errorEnvelope("VALIDATION_ERROR", "Missing event ID.", request.requestId));
      return;
    }

    const prisma = getPrismaClient();

    try {
      // Persist the minimal envelope BEFORE any processing (identity-sync.md §2 step 3) —
      // its own uniqueness is the idempotency dedup key (identity-sync.md §2 step 6 /
      // threat #14 "replayed webhook").
      await prisma.clerkWebhookEvent.create({
        data: { id: eventId, eventType: event.type, status: "RECEIVED" },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        request.log.info(
          { eventId, eventType: event.type },
          "duplicate clerk webhook event — no-op",
        );
        reply
          .code(200)
          .send(
            successEnvelope({ received: true, duplicate: true }, { requestId: request.requestId }),
          );
        return;
      }
      throw error;
    }

    const payload: ClerkWebhookEventPayload = {
      eventId,
      eventType: event.type,
      data: event.data,
      correlationId: generateRequestId(),
    };

    await getWebhookQueue(opts.env.REDIS_URL).add(CLERK_WEBHOOK_EVENT_JOB_NAME, payload, {
      jobId: eventId,
      attempts: 8,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 1_000,
    });

    reply
      .code(200)
      .send(
        successEnvelope({ received: true, duplicate: false }, { requestId: request.requestId }),
      );
  });
}

function toWebRequest(request: FastifyRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }

  // The host/scheme are never used by verifyWebhook (it only reads headers + body) — a
  // fixed internal placeholder avoids depending on trustProxy-derived values for this.
  return new Request(`https://internal.invalid${request.url}`, {
    method: request.method,
    headers,
    body: request.rawBody ?? "",
  });
}
