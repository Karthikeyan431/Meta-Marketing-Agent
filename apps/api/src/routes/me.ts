import type { FastifyInstance } from "fastify";
import { meResponseSchema, successEnvelope } from "@ai-marketing-manager/contracts";
import { requireAuthenticatedIdentity } from "../plugins/auth.js";

/**
 * Proves the API-side authentication boundary (Phase 2.2 scope): resolves the caller's
 * verified Clerk identity, or fails with 401. No workspace/authorization decision is made
 * here — see docs/identity/phase-2-implementation-sequence.md for where that lands later.
 */
export default async function meRoute(app: FastifyInstance) {
  app.get("/me", async (request, reply) => {
    const identity = requireAuthenticatedIdentity(request);

    const body = meResponseSchema.parse({ userId: identity.userId });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });
}
