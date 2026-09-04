import { Queue, Worker, type Processor } from "bullmq";
import type { Logger } from "@ai-marketing-manager/config";
import { getRedisConnection } from "./connection.js";
import type { QueueName } from "./queues.js";

export function createQueue(name: QueueName, redisUrl: string): Queue {
  return new Queue(name, { connection: getRedisConnection(redisUrl) });
}

export interface WorkerBootstrapOptions<T> {
  queueName: QueueName;
  redisUrl: string;
  logger: Logger;
  processor: Processor<T>;
  concurrency?: number;
}

export interface BootstrappedWorker {
  worker: Worker;
  isReady: () => boolean;
  shutdown: () => Promise<void>;
}

/**
 * Shared lifecycle wrapper every logical worker (sync/insights/optimization/report/
 * webhook/maintenance) boots through: structured logging on every job/lifecycle event,
 * a readiness flag for the worker's own health endpoint, and graceful shutdown.
 */
export function bootstrapWorker<T>(options: WorkerBootstrapOptions<T>): BootstrappedWorker {
  const { queueName, redisUrl, logger, processor, concurrency = 5 } = options;
  const connection = getRedisConnection(redisUrl);
  const worker = new Worker<T>(queueName, processor, { connection, concurrency });

  let ready = false;
  worker.on("ready", () => {
    ready = true;
    logger.info({ queue: queueName }, "worker ready");
  });
  worker.on("active", (job) => {
    logger.info({ queue: queueName, jobId: job.id, jobName: job.name }, "job started");
  });
  worker.on("completed", (job) => {
    logger.info({ queue: queueName, jobId: job.id, jobName: job.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { queue: queueName, jobId: job?.id, jobName: job?.name, err: err.message },
      "job failed",
    );
  });
  worker.on("error", (err) => {
    logger.error({ queue: queueName, err: err.message }, "worker error");
  });

  const shutdown = async () => {
    ready = false;
    logger.info({ queue: queueName }, "worker shutting down");
    await worker.close();
  };

  return { worker, isReady: () => ready, shutdown };
}
