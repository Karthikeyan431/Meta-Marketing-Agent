import { z } from "zod";

/**
 * Client-safe environment configuration. Only NEXT_PUBLIC_* variables are ever readable
 * in the browser — never put a secret behind this prefix (ENVIRONMENT_VARIABLES.md).
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env["NEXT_PUBLIC_API_URL"],
});
