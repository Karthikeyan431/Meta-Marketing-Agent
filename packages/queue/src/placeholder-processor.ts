import type { Job, Processor } from "bullmq";
import type { Logger } from "@ai-marketing-manager/config";
import type { QueueName } from "./queues.js";

/**
 * Used by every worker whose real job types don't exist yet (sync/insights/optimization/
 * report/webhook — see each worker's README). The worker still boots, connects to Redis,
 * and reports ready so its lifecycle/health pattern is fully exercised; it just has nothing
 * real to process yet. Any job that somehow lands here fails loudly rather than silently
 * succeeding, since nothing in Phase 1 should ever enqueue to these queues.
 */
export function createPlaceholderProcessor(queueName: QueueName, logger: Logger): Processor {
  return async (job: Job) => {
    logger.error(
      { queue: queueName, jobId: job.id, jobName: job.name },
      "received a job on a worker with no implemented processor yet — this should not happen in Phase 1",
    );
    throw new Error(
      `Worker "${queueName}" has no job processor implemented yet (Phase 1 foundation only).`,
    );
  };
}
