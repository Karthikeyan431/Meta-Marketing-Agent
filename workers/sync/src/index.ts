import {
  createLogger,
  createHealthServer,
  registerGracefulShutdown,
} from "@ai-marketing-manager/config";
import {
  bootstrapWorker,
  closeRedisConnection,
  createQueue,
  META_SYNC_SCHEDULER_JOB_NAME,
  META_SYNC_SCHEDULER_REPEAT_JOB_ID,
} from "@ai-marketing-manager/queue";
import { disconnectDatabase } from "@ai-marketing-manager/domain";
import { loadWorkerEnv } from "./env.js";
import { createSyncProcessor } from "./processor.js";

const QUEUE_NAME = "sync";

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
    processor: createSyncProcessor({
      logger,
      redisUrl: env.REDIS_URL,
      metaApiVersion: env.META_API_VERSION,
      metaCredentialEncryptionKey: env.META_CREDENTIAL_ENCRYPTION_KEY,
    }),
    concurrency: env.WORKER_CONCURRENCY,
  });

  // Optional by design (Hard Restrictions: never a real Meta credential in CI) — the
  // scheduled sync is simply not registered (logged, not fatal) when absent, mirroring
  // workers/webhook's identical CLERK_SECRET_KEY-conditional registration. A manually
  // triggered sync job would also no-op via the processor's own config gate.
  if (env.META_CREDENTIAL_ENCRYPTION_KEY) {
    const syncQueue = createQueue(QUEUE_NAME, env.REDIS_URL);
    await syncQueue.add(
      META_SYNC_SCHEDULER_JOB_NAME,
      {},
      {
        repeat: { every: env.META_SYNC_INTERVAL_MS },
        jobId: META_SYNC_SCHEDULER_REPEAT_JOB_ID,
      },
    );
    logger.info({ intervalMs: env.META_SYNC_INTERVAL_MS }, "meta sync schedule registered");
  } else {
    logger.warn(
      "META_CREDENTIAL_ENCRYPTION_KEY not configured — meta sync schedule not registered",
    );
  }

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
      async () => disconnectDatabase(),
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
