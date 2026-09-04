import type { Job, Processor } from "bullmq";
import type { Logger } from "@ai-marketing-manager/config";
import {
  EXAMPLE_JOB_NAME,
  processExampleJob,
  type ExampleJobPayload,
} from "@ai-marketing-manager/queue";

/**
 * The only worker with a real (harmless) job type in Phase 1 — see workers/README.md.
 * Dispatches by job name so future real maintenance jobs can be added alongside it
 * without disturbing the example-job proof-of-concept.
 */
export function createMaintenanceProcessor(logger: Logger): Processor {
  return async (job: Job) => {
    if (job.name === EXAMPLE_JOB_NAME) {
      return processExampleJob(job as Job<ExampleJobPayload>);
    }
    logger.error(
      { queue: "maintenance", jobId: job.id, jobName: job.name },
      "received an unrecognized job name on the maintenance worker",
    );
    throw new Error(`Unknown job name "${job.name}" for maintenance worker.`);
  };
}
