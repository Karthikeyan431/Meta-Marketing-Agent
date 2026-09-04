import {
  createLogger,
  createHealthServer,
  registerGracefulShutdown,
} from "@ai-marketing-manager/config";
import {
  bootstrapWorker,
  closeRedisConnection,
  createPlaceholderProcessor,
} from "@ai-marketing-manager/queue";
import { loadWorkerEnv } from "./env.js";

const QUEUE_NAME = "insights";

async function main() {
  const env = loadWorkerEnv();
  const logger = createLogger({
    serviceName: `worker-${QUEUE_NAME}`,
    level: env.LOG_LEVEL,
    pretty: env.APP_ENV === "local",
  });

  const { shutdown, isReady } = bootstrapWorker({
    queueName: QUEUE_NAME,
    redisUrl: env.REDIS_URL,
    logger,
    processor: createPlaceholderProcessor(QUEUE_NAME, logger),
    concurrency: env.WORKER_CONCURRENCY,
  });

  const healthServer = createHealthServer({
    port: env.HEALTH_PORT,
    serviceName: `worker-${QUEUE_NAME}`,
    logger,
    isReady,
  });

  registerGracefulShutdown({
    logger,
    handlers: [
      async () => shutdown(),
      async () => closeRedisConnection(),
      async () => new Promise<void>((resolve) => healthServer.close(() => resolve())),
    ],
  });

  logger.info({ healthPort: env.HEALTH_PORT }, `worker-${QUEUE_NAME} started`);
}

main().catch((error: unknown) => {
  console.error(`Fatal error during worker-${QUEUE_NAME} startup:`, error);
  process.exit(1);
});
