import type { Job, Processor } from "bullmq";
import type { ClerkClient } from "@clerk/backend";
import type { Logger } from "@ai-marketing-manager/config";
import { getPrismaClient } from "@ai-marketing-manager/domain";
import {
  CLERK_WEBHOOK_EVENT_JOB_NAME,
  CLERK_RECONCILIATION_JOB_NAME,
  clerkWebhookEventPayloadSchema,
} from "@ai-marketing-manager/queue";
import { applyWebhookEvent } from "./apply-webhook-event.js";
import { reconcileIdentity } from "./reconcile.js";

export interface WebhookProcessorDeps {
  clerkClient: ClerkClient | null;
  logger: Logger;
}

/**
 * Dispatches by job name (mirrors workers/maintenance's pattern) — the "webhook" queue
 * carries both live Clerk webhook events and the scheduled reconciliation pass (Phase 2.3
 * Step 5), since both are the same identity-sync concern reusing the same queue/worker
 * rather than inventing a new one (identity-sync.md §2 step 5).
 */
export function createWebhookProcessor(deps: WebhookProcessorDeps): Processor {
  return async (job: Job) => {
    const prisma = getPrismaClient();

    if (job.name === CLERK_WEBHOOK_EVENT_JOB_NAME) {
      const payload = clerkWebhookEventPayloadSchema.parse(job.data);
      const result = await applyWebhookEvent(prisma, payload);
      await prisma.clerkWebhookEvent.update({
        where: { id: payload.eventId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      deps.logger.info(
        { eventId: payload.eventId, eventType: payload.eventType, outcome: result.outcome },
        "clerk webhook event processed",
      );
      return result;
    }

    if (job.name === CLERK_RECONCILIATION_JOB_NAME) {
      if (!deps.clerkClient) {
        deps.logger.warn(
          "clerk reconciliation job received but CLERK_SECRET_KEY is not configured — skipping",
        );
        return { skipped: true };
      }
      const summary = await reconcileIdentity({
        prisma,
        clerkClient: deps.clerkClient,
        logger: deps.logger,
      });
      deps.logger.info({ ...summary }, "clerk identity reconciliation completed");
      return summary;
    }

    deps.logger.error(
      { queue: "webhook", jobId: job.id, jobName: job.name },
      "unrecognized job name on webhook worker",
    );
    throw new Error(`Unknown job name "${job.name}" for webhook worker.`);
  };
}
