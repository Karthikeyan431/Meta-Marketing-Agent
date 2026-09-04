import { afterAll, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import { createLogger } from "@ai-marketing-manager/config";
import {
  createQueue,
  getRedisConnection,
  closeRedisConnection,
  EXAMPLE_JOB_NAME,
  processExampleJob,
  type ExampleJobPayload,
  type ExampleJobResult,
} from "@ai-marketing-manager/queue";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

/**
 * End-to-end proof of the queue infrastructure (Phase 1 task §6): enqueue a real BullMQ
 * job onto the "maintenance" queue and confirm an in-process worker picks it up,
 * processes it, and completes — the same code path workers/maintenance runs in production,
 * just without a separately running process.
 */
describe("BullMQ enqueue/consume — maintenance queue example-ping job", () => {
  afterAll(async () => {
    await closeRedisConnection();
  });

  it("processes an enqueued example-ping job end-to-end", async () => {
    createLogger({ serviceName: "test-queue", level: "silent" }); // exercises the logger factory too
    const queue = createQueue("maintenance", REDIS_URL);
    const connection = getRedisConnection(REDIS_URL);
    const worker = new Worker<ExampleJobPayload, ExampleJobResult>(
      "maintenance",
      (job) => processExampleJob(job),
      { connection },
    );

    try {
      await worker.waitUntilReady();

      const completed = new Promise<ExampleJobResult>((resolve, reject) => {
        worker.on("completed", (job, result: ExampleJobResult) => {
          if (job.name === EXAMPLE_JOB_NAME) resolve(result);
        });
        worker.on("failed", (_job, err) => reject(err));
      });

      await queue.add(EXAMPLE_JOB_NAME, { message: "integration-test-ping" });

      const result = await completed;
      expect(result.echoedMessage).toBe("integration-test-ping");
      expect(new Date(result.processedAt).toString()).not.toBe("Invalid Date");
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 15_000);
});
