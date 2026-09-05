import Fastify from "fastify";
import type { Logger } from "@ai-marketing-manager/config";
import type { ApiEnv } from "./env.js";
import requestIdPlugin from "./plugins/request-id.js";
import securityPlugin from "./plugins/security.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authPlugin from "./plugins/auth.js";
import healthRoute from "./routes/health.js";
import readyRoute from "./routes/ready.js";
import meRoute from "./routes/me.js";

export interface BuildAppOptions {
  env: ApiEnv;
  logger: Logger;
}

/**
 * Builds a fully-configured Fastify instance without starting it — used by both
 * server.ts (real boot) and integration tests (inject requests without binding a port).
 *
 * Return type is intentionally inferred (not annotated as the generic `FastifyInstance`)
 * — passing a `pino.Logger` via `loggerInstance` produces a `FastifyInstance` whose
 * `Logger` generic parameter doesn't structurally match the library's own default
 * `FastifyInstance` type alias, which is a known Fastify v5 typing friction point.
 * Consumers should use `App` (below), not `FastifyInstance`, to refer to this type.
 */
export async function buildApp(options: BuildAppOptions) {
  const { env, logger } = options;

  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: true,
  });

  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { env });
  await app.register(authPlugin, { env });
  await app.register(healthRoute);
  await app.register(readyRoute, { env });
  await app.register(meRoute);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
