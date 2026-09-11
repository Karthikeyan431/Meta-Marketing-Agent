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
import workspacesRoute from "./routes/workspaces.js";
import webhooksClerkRoute from "./routes/webhooks-clerk.js";
import metaRoute from "./routes/meta.js";
import campaignsRoute from "./routes/campaigns.js";

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

  // Captures the exact raw body string onto request.rawBody alongside normal JSON
  // parsing — POST /webhooks/clerk needs the literal bytes to verify Clerk's HMAC
  // signature (verifying a re-serialized object would silently break on any
  // whitespace/key-order difference). Every other route's parsed-body behavior is
  // unchanged.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    request.rawBody = raw;
    if (raw.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { env });
  await app.register(authPlugin, { env });
  await app.register(healthRoute);
  await app.register(readyRoute, { env });
  await app.register(meRoute);
  await app.register(workspacesRoute, { env });
  await app.register(webhooksClerkRoute, { env });
  await app.register(metaRoute, { env });
  await app.register(campaignsRoute, { env });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
