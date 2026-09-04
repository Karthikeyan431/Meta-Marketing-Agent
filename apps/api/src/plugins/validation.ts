import type { FastifyRequest, FastifyReply } from "fastify";
import type { z } from "zod";
import { errorEnvelope } from "@ai-marketing-manager/contracts";

/**
 * Request validation foundation: every future endpoint that accepts a body validates it
 * through this helper (or an equivalent preHandler) rather than trusting client input
 * directly, per DEVELOPMENT_PRINCIPLES.md ("validate all external input") and
 * API_CONTRACTS.md's request/response contract requirements.
 *
 * Returns the parsed, typed body on success. On failure, sends a 400 VALIDATION_ERROR
 * envelope and returns `undefined` — callers must check for `undefined` and stop.
 */
export async function validateBody<Schema extends z.ZodTypeAny>(
  schema: Schema,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<z.infer<Schema> | undefined> {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    await reply.code(400).send(errorEnvelope("VALIDATION_ERROR", message, request.requestId));
    return undefined;
  }
  return result.data;
}
