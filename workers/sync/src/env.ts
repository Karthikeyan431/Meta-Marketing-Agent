import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@ai-marketing-manager/config";
import { DEFAULT_META_SYNC_INTERVAL_MS } from "@ai-marketing-manager/queue";

export const workerEnvSchema = baseEnvSchema.extend({
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  HEALTH_PORT: z.coerce.number().int().positive().default(4102),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // Optional, mirroring apps/api's env.ts — when absent, the scheduled sync registration is
  // skipped entirely (logged, not fatal), same pattern as workers/webhook's CLERK_SECRET_KEY.
  // Never a real credential in CI (Hard Restrictions).
  META_API_VERSION: z.string().min(1).default("v25.0"),
  META_CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
  META_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_META_SYNC_INTERVAL_MS),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv("worker-sync", workerEnvSchema, source);
}
