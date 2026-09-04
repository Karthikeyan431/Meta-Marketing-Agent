import { createLogger, registerGracefulShutdown } from "@ai-marketing-manager/config";
import { disconnectDatabase } from "@ai-marketing-manager/domain";
import { closeRedisConnection } from "@ai-marketing-manager/queue";
import { loadApiEnv } from "./env.js";
import { buildApp } from "./app.js";

async function main() {
  const env = loadApiEnv();
  const logger = createLogger({
    serviceName: "api",
    level: env.LOG_LEVEL,
    pretty: env.APP_ENV === "local",
  });

  const app = await buildApp({ env, logger });

  registerGracefulShutdown({
    logger,
    handlers: [
      async () => app.close(),
      async () => disconnectDatabase(),
      async () => closeRedisConnection(),
    ],
  });

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST, appEnv: env.APP_ENV }, "api started");
}

main().catch((error: unknown) => {
  // A logger may not exist yet if env loading itself failed, so fall back to console.error.
  console.error("Fatal error during API startup:", error);
  process.exit(1);
});
