import type { FastifyInstance } from "fastify";
import { checkDatabaseHealth } from "@ai-marketing-manager/domain";
import { checkRedisHealth } from "@ai-marketing-manager/queue";
import {
  readinessResponseSchema,
  successEnvelope,
  type DependencyCheck,
} from "@ai-marketing-manager/contracts";
import type { ApiEnv } from "../env.js";

function toDependencyCheck(result: {
  ok: boolean;
  latencyMs: number;
  message?: string;
}): DependencyCheck {
  return {
    status: result.ok ? "ok" : "error",
    latencyMs: Math.round(result.latencyMs),
    ...(result.message ? { message: result.message } : {}),
  };
}

/** Readiness probe: are this instance's required dependencies (DB, Redis) actually reachable? */
export default async function readyRoute(app: FastifyInstance, opts: { env: ApiEnv }) {
  app.get("/ready", async (request, reply) => {
    const [dbResult, redisResult] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(opts.env.REDIS_URL),
    ]);

    const checks = {
      database: toDependencyCheck(dbResult),
      redis: toDependencyCheck(redisResult),
    };
    const allOk = Object.values(checks).every((check) => check.status === "ok");

    const body = readinessResponseSchema.parse({
      status: allOk ? "ok" : "unavailable",
      service: "api",
      timestamp: new Date().toISOString(),
      checks,
    });

    reply.code(allOk ? 200 : 503).send(successEnvelope(body, { requestId: request.requestId }));
  });
}
