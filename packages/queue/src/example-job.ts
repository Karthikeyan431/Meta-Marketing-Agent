import { z } from "zod";
import type { Job } from "bullmq";

/**
 * Harmless example job used only to verify the queue infrastructure end-to-end
 * (enqueue -> worker picks it up -> processes -> completes). It performs no
 * business action and touches no external system. Registered on the
 * "maintenance" queue — see workers/maintenance and tests/integration/queue.test.ts.
 */
export const EXAMPLE_JOB_NAME = "example-ping";

export const exampleJobPayloadSchema = z.object({
  message: z.string().min(1).max(200),
});
export type ExampleJobPayload = z.infer<typeof exampleJobPayloadSchema>;

export interface ExampleJobResult {
  echoedMessage: string;
  processedAt: string;
}

export async function processExampleJob(job: Job<ExampleJobPayload>): Promise<ExampleJobResult> {
  const payload = exampleJobPayloadSchema.parse(job.data);
  return {
    echoedMessage: payload.message,
    processedAt: new Date().toISOString(),
  };
}
