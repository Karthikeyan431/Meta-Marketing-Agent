import { z } from "zod";
import { baseEnvSchema, loadEnv } from "@ai-marketing-manager/config";

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  // Optional (not required with a default) so the API can boot and every non-auth route
  // keeps working with no Clerk application configured at all (e.g. this repo's own CI).
  // When absent, every request resolves as unauthenticated — never as authenticated by
  // default — see apps/api/src/plugins/auth.ts.
  CLERK_SECRET_KEY: z.string().min(1).optional(),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv("api", apiEnvSchema, source);
}
