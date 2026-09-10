import {
  createLogger,
  createHealthServer,
  registerGracefulShutdown,
} from "@ai-marketing-manager/config";
import {
  bootstrapWorker,
  closeRedisConnection,
  createQueue,
  CLERK_RECONCILIATION_JOB_NAME,
  CLERK_RECONCILIATION_REPEAT_JOB_ID,
  CLERK_WEBHOOK_EVENT_JOB_NAME,
} from "@ai-marketing-manager/queue";
import { createClerkClient } from "@clerk/backend";
import { disconnectDatabase, getPrismaClient } from "@ai-marketing-manager/domain";
import { loadWorkerEnv } from "./env.js";
import { createWebhookProcessor } from "./processor.js";

const QUEUE_NAME = "webhook";

async function main() {
  const env = loadWorkerEnv();
  const logger = createLogger({
    serviceName: `worker-${QUEUE_NAME}`,
    level: env.LOG_LEVEL,
    pretty: env.APP_ENV === "local",
  });

  // Optional by design (Hard Restrictions: never a real Clerk key in CI) — reconciliation
  // is simply skipped (logged, not fatal) when absent. Live webhook event processing does
  // not need this client at all (it only ever mutates our own database).
  const clerkClient = env.CLERK_SECRET_KEY
    ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
    : null;

  const { worker, shutdown, isReady } = bootstrapWorker({
    queueName: QUEUE_NAME,
    redisUrl: env.REDIS_URL,
    logger,
    processor: createWebhookProcessor({ clerkClient, logger }),
    concurrency: env.WORKER_CONCURRENCY,
  });

  // A Clerk webhook event job that exhausts every BullMQ retry attempt (identity-sync.md
  // §3's deferral mechanism reaching its bound) is marked FAILED on its durability envelope
  // — never left silently RECEIVED forever. Reconciliation remains the eventual backstop
  // regardless (identity-sync.md §4).
  worker.on("failed", (job, err) => {
    if (!job || job.name !== CLERK_WEBHOOK_EVENT_JOB_NAME) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return;

    const eventId = (job.data as { eventId?: unknown }).eventId;
    if (typeof eventId !== "string") return;

    getPrismaClient()
      .clerkWebhookEvent.update({
        where: { id: eventId },
        data: { status: "FAILED", failureNote: err.message.slice(0, 500) },
      })
      .catch((updateError: unknown) => {
        logger.error({ err: updateError, eventId }, "failed to mark clerk webhook event FAILED");
      });
  });

  if (clerkClient) {
    const reconciliationQueue = createQueue(QUEUE_NAME, env.REDIS_URL);
    await reconciliationQueue.add(
      CLERK_RECONCILIATION_JOB_NAME,
      {},
      {
        repeat: { every: env.RECONCILIATION_INTERVAL_MS },
        jobId: CLERK_RECONCILIATION_REPEAT_JOB_ID,
      },
    );
    logger.info(
      { intervalMs: env.RECONCILIATION_INTERVAL_MS },
      "clerk identity reconciliation schedule registered",
    );
  } else {
    logger.warn(
      "CLERK_SECRET_KEY not configured — clerk identity reconciliation schedule not registered",
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
