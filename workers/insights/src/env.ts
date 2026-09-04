import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@ai-marketing-manager/config";

export const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  HEALTH_PORT: z.coerce.number().int().positive().default(4102),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv("worker-insights", workerEnvSchema, source);
}
