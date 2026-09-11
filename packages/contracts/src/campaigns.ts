import { z } from "zod";

/**
 * Campaign/Ad Set/Ad + sync-trigger API contracts — Phase 4.1 (docs/meta/meta-api-contracts.md
 * §1's Phase 4.1 addendum, docs/meta/meta-resource-model.md §4). Read-only — no
 * create/update/delete shape exists (OD-3A-09: zero Meta mutation capability through Phase
 * 4.1). `BigInt` budget fields are serialized as decimal strings (JSON has no native BigInt
 * representation) — never a JS `number`, which would silently lose precision for large
 * values (the same money-handling rule that keeps them `BigInt` in storage).
 */

export const syncTriggerResponseSchema = z.object({
  enqueued: z.number(),
});
export type SyncTriggerResponse = z.infer<typeof syncTriggerResponseSchema>;

export const syncedResourceLifecycleStatusSchema = z.enum(["ACTIVE", "EXTERNALLY_REMOVED"]);

export const campaignSummarySchema = z.object({
  id: z.string(),
  adAccountId: z.string(),
  externalId: z.string(),
  name: z.string(),
  status: z.string(),
  effectiveStatus: z.string(),
  objective: z.string(),
  dailyBudget: z.string().nullable(),
  lifetimeBudget: z.string().nullable(),
  budgetRemaining: z.string().nullable(),
  startTime: z.string().nullable(),
  stopTime: z.string().nullable(),
  sourceUpdatedAt: z.string().nullable(),
  lifecycleStatus: syncedResourceLifecycleStatusSchema,
  lastSyncedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;

export const listCampaignsResponseSchema = z.object({
  campaigns: z.array(campaignSummarySchema),
});
export type ListCampaignsResponse = z.infer<typeof listCampaignsResponseSchema>;

export const getCampaignResponseSchema = z.object({
  campaign: campaignSummarySchema,
});
export type GetCampaignResponse = z.infer<typeof getCampaignResponseSchema>;

export const adSetSummarySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  externalId: z.string(),
  name: z.string(),
  status: z.string(),
  effectiveStatus: z.string(),
  optimizationGoal: z.string().nullable(),
  billingEvent: z.string().nullable(),
  bidStrategy: z.string().nullable(),
  dailyBudget: z.string().nullable(),
  lifetimeBudget: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  sourceUpdatedAt: z.string().nullable(),
  lifecycleStatus: syncedResourceLifecycleStatusSchema,
  lastSyncedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdSetSummary = z.infer<typeof adSetSummarySchema>;

export const listAdSetsResponseSchema = z.object({
  adSets: z.array(adSetSummarySchema),
});
export type ListAdSetsResponse = z.infer<typeof listAdSetsResponseSchema>;

export const getAdSetResponseSchema = z.object({
  adSet: adSetSummarySchema,
});
export type GetAdSetResponse = z.infer<typeof getAdSetResponseSchema>;

export const adSummarySchema = z.object({
  id: z.string(),
  adSetId: z.string(),
  externalId: z.string(),
  name: z.string(),
  status: z.string(),
  effectiveStatus: z.string(),
  creativeExternalId: z.string().nullable(),
  creativeName: z.string().nullable(),
  sourceUpdatedAt: z.string().nullable(),
  lifecycleStatus: syncedResourceLifecycleStatusSchema,
  lastSyncedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdSummary = z.infer<typeof adSummarySchema>;

export const listAdsResponseSchema = z.object({
  ads: z.array(adSummarySchema),
});
export type ListAdsResponse = z.infer<typeof listAdsResponseSchema>;

export const getAdResponseSchema = z.object({
  ad: adSummarySchema,
});
export type GetAdResponse = z.infer<typeof getAdResponseSchema>;
