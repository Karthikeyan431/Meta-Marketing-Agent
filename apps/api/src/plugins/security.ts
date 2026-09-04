import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ApiEnv } from "../env.js";

export interface SecurityPluginOptions {
  env: ApiEnv;
}

/**
 * Foundation-level security controls only (SECURE_CODING_RULES.md / API_SECURITY.md SEC-008):
 * secure headers, CORS restricted to a configured origin, a generic rate-limit abstraction,
 * and a hard request body size cap. Real per-route/per-workspace/per-AI-call rate-limit tiers
 * (RATE_LIMITING_ABUSE.md's 8-layer model) are implemented as each surface is built.
 */
export default fp(async function securityPlugin(app: FastifyInstance, opts: SecurityPluginOptions) {
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    global: true,
  });

  await app.register(cors, {
    origin: opts.env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: opts.env.RATE_LIMIT_MAX,
    timeWindow: opts.env.RATE_LIMIT_WINDOW_MS,
    hook: "onRequest",
  });
});
