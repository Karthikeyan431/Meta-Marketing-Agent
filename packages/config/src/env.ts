import { z } from "zod";

/**
 * Fields every service in the monorepo needs, regardless of what else it validates.
 * Individual apps extend this with `z.object({ ...baseEnvSchema.shape, ... })`.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "development", "staging", "production"]).default("local"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export class EnvValidationError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly issues: readonly { path: string; message: string }[],
  ) {
    // Deliberately include only variable NAMES and validation messages, never values —
    // this error is safe to log and to surface in a startup failure message.
    const lines = issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n");
    super(`Invalid environment configuration for "${serviceName}":\n${lines}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Parse and validate process.env (or an injected source, for tests) against a Zod schema.
 * Fails fast and loudly at startup rather than allowing an unconfigured service to boot.
 * Never logs or throws raw environment values for fields that look secret-shaped.
 */
export function loadEnv<Schema extends z.ZodTypeAny>(
  serviceName: string,
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new EnvValidationError(serviceName, issues);
  }
  return result.data;
}
