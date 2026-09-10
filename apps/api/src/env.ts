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
  // Optional for the same reason as CLERK_SECRET_KEY above — when absent, POST
  // /webhooks/clerk rejects every request (never accepts an unverifiable webhook) rather
  // than falling back to some other trust mechanism. See routes/webhooks-clerk.ts.
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  // Meta OAuth (Phase 3.1, docs/meta/meta-oauth.md). All optional for the same reason as
  // the Clerk variables above — never a real credential in CI (Hard Restriction). When
  // absent, every Meta route responds 503 PROVIDER_UNAVAILABLE rather than falling back to
  // any other trust mechanism. Development-app credentials only in this phase — see
  // docs/meta/meta-app-review.md §2; never a production Meta app.
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  // Re-verified live 2026-09-10 (docs/meta/meta-app-review.md §1) — v25.0 recommended
  // initial pin, longer support runway than the newer v26.0. Configuration, never
  // hardcoded in application logic (meta-architecture.md §1 principle 7).
  META_API_VERSION: z.string().min(1).default("v25.0"),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  // AES-256-GCM key for Meta credential encryption-at-rest (meta-token-security.md §2),
  // 32 bytes, base64-encoded. See packages/domain/src/meta/crypto.ts.
  META_CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv("api", apiEnvSchema, source);
}
