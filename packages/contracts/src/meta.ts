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

/**
 * Business/Ad Account discovery contracts — Phase 3.2 (docs/meta/meta-account-discovery.md,
 * meta-resource-model.md). Discovery responses are ephemeral (never persisted verbatim,
 * meta-account-discovery.md §2) — persisted schemas below are separate and distinct.
 */

export const metaBusinessSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  verificationStatus: z.string().optional(),
});
export type MetaBusinessSummary = z.infer<typeof metaBusinessSummarySchema>;

export const listMetaBusinessesResponseSchema = z.object({
  businesses: z.array(metaBusinessSummarySchema),
});
export type ListMetaBusinessesResponse = z.infer<typeof listMetaBusinessesResponseSchema>;

/** A live discovery candidate — not yet necessarily selected/persisted. `alreadySelected`
 *  lets the client show current selection state without a second round trip. */
export const metaAdAccountDiscoverySchema = z.object({
  externalId: z.string(),
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  accountStatus: z.string(),
  businessExternalId: z.string().nullable(),
  businessName: z.string().nullable(),
  alreadySelected: z.boolean(),
});
export type MetaAdAccountDiscovery = z.infer<typeof metaAdAccountDiscoverySchema>;

export const listMetaAdAccountDiscoveryResponseSchema = z.object({
  adAccounts: z.array(metaAdAccountDiscoverySchema),
});
export type ListMetaAdAccountDiscoveryResponse = z.infer<
  typeof listMetaAdAccountDiscoveryResponseSchema
>;

export const adAccountSelectionStatusSchema = z.enum(["ACTIVE", "DESELECTED"]);

/** A persisted, previously-selected Ad Account (meta-resource-model.md §4's field set). */
export const adAccountSummarySchema = z.object({
  id: z.string(),
  externalId: z.string(),
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  accountStatus: z.string(),
  businessExternalId: z.string().nullable(),
  businessName: z.string().nullable(),
  status: adAccountSelectionStatusSchema,
  selectedAt: z.string(),
  deselectedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
});
export type AdAccountSummary = z.infer<typeof adAccountSummarySchema>;

export const listAdAccountsResponseSchema = z.object({
  adAccounts: z.array(adAccountSummarySchema),
});
export type ListAdAccountsResponse = z.infer<typeof listAdAccountsResponseSchema>;

/** Bounded batch size (safety, not a product limit) — mirrors this codebase's existing
 *  discovery-pagination safety bound (`meta-client.ts`'s `MAX_DISCOVERY_PAGES`). */
export const selectAdAccountsRequestSchema = z.object({
  externalIds: z.array(z.string().min(1)).min(1).max(50),
});
export type SelectAdAccountsRequest = z.infer<typeof selectAdAccountsRequestSchema>;

export const selectAdAccountsResponseSchema = z.object({
  adAccounts: z.array(adAccountSummarySchema),
});
export type SelectAdAccountsResponse = z.infer<typeof selectAdAccountsResponseSchema>;

export const deselectAdAccountResponseSchema = z.object({
  adAccount: adAccountSummarySchema,
});
export type DeselectAdAccountResponse = z.infer<typeof deselectAdAccountResponseSchema>;
