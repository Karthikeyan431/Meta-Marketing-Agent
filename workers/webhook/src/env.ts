import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@ai-marketing-manager/config";
import { DEFAULT_RECONCILIATION_INTERVAL_MS } from "@ai-marketing-manager/queue";

export const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  HEALTH_PORT: z.coerce.number().int().positive().default(4105),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // Optional — when absent, reconciliation (identity-sync.md §4) is skipped entirely
  // (logged, not a fatal error) rather than calling the Clerk Backend API without a real
  // key. Never set to a real key in CI (Hard Restrictions).
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  RECONCILIATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RECONCILIATION_INTERVAL_MS),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv("worker-webhook", workerEnvSchema, source);
}
