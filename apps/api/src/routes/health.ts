import type { FastifyInstance } from "fastify";
import { healthResponseSchema, successEnvelope } from "@ai-marketing-manager/contracts";

/** Liveness probe: process is up and can respond. Never checks dependencies — that's /ready. */
export default async function healthRoute(app: FastifyInstance) {
  app.get("/health", async (request, reply) => {
    const body = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });
}
