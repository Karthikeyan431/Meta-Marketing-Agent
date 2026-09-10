import { z } from "zod";

/**
 * Meta connection API contracts — Phase 3.1 (docs/meta/meta-api-contracts.md,
 * meta-connection-model.md). Never includes credential ciphertext, IV, auth tag, or the raw
 * Meta access token in any response shape (meta-token-security.md §2).
 */

export const metaConnectionStatusSchema = z.enum([
  "CONNECTED",
  "DEGRADED",
  "REAUTH_REQUIRED",
  "DISCONNECTED",
  "ERROR",
]);
export type MetaConnectionStatusContract = z.infer<typeof metaConnectionStatusSchema>;

/** Deliberately excludes credential material and any raw Meta response field — only safe,
 *  already-normalized metadata (meta-connection-model.md §1's sensitivity table). */
export const metaConnectionSummarySchema = z.object({
  id: z.string(),
  status: metaConnectionStatusSchema,
  externalUserId: z.string(),
  scopes: z.array(z.string()),
  lastValidatedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  disconnectedAt: z.string().nullable(),
});
export type MetaConnectionSummary = z.infer<typeof metaConnectionSummarySchema>;

/** `POST /workspaces/:id/meta/connect` and `.../connections/:connectionId/reconnect` both
 *  return only a URL to redirect the browser to — never a token, never any credential. */
export const metaOAuthInitiationResponseSchema = z.object({
  authorizationUrl: z.string(),
});
export type MetaOAuthInitiationResponse = z.infer<typeof metaOAuthInitiationResponseSchema>;

export const listMetaConnectionsResponseSchema = z.object({
  connections: z.array(metaConnectionSummarySchema),
});
export type ListMetaConnectionsResponse = z.infer<typeof listMetaConnectionsResponseSchema>;

export const disconnectMetaConnectionResponseSchema = z.object({
  connection: metaConnectionSummarySchema,
});
export type DisconnectMetaConnectionResponse = z.infer<
  typeof disconnectMetaConnectionResponseSchema
>;
