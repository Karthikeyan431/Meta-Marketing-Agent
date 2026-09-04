import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const dependencyCheckStatusSchema = z.enum(["ok", "error"]);

export const dependencyCheckSchema = z.object({
  status: dependencyCheckStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().optional(),
});
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

export const readinessStatusSchema = z.enum(["ok", "degraded", "unavailable"]);

export const readinessResponseSchema = z.object({
  status: readinessStatusSchema,
  service: z.string(),
  timestamp: z.string(),
  checks: z.record(z.string(), dependencyCheckSchema),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
