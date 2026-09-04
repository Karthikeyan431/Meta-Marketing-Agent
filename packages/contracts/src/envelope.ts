import { z } from "zod";

/**
 * Standard API envelopes, per docs/ai-marketing-manager-gate-7-api-docs/docs/08-api/API_CONTRACTS.md.
 * Every application API response uses one of these two shapes — never a bare payload.
 */

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function errorEnvelope(code: ErrorCode, message: string, requestId: string): ErrorEnvelope {
  return { error: { code, message, requestId } };
}

export interface SuccessMeta {
  requestId: string;
  nextCursor?: string;
}

export interface SuccessEnvelope<T> {
  data: T;
  meta: SuccessMeta;
}

export function successEnvelope<T>(data: T, meta: SuccessMeta): SuccessEnvelope<T> {
  return { data, meta };
}
