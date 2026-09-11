import type { PrismaClient, Prisma, Campaign, AdSet, Ad } from "@prisma/client";
import { withConflictRetry } from "../prisma-errors.js";

/**
 * Campaign/Ad Set/Ad persistence (Phase 4.1, meta-resource-model.md §3-4, meta-sync.md).
 * Every lookup is scoped `workspace_id + external_id` — the external Meta ID is never an
 * authorization key on its own (meta-threat-model.md #7-#8), identical shape to AdAccount.
 * A resource no longer returned by a sync pass is marked `EXTERNALLY_REMOVED`, never hard-
 * deleted (meta-resource-model.md §5). An incoming write older than the row's own
 * `sourceUpdatedAt` never overwrites the newer data (meta-threat-model.md #15's
 * reconciliation-convergence principle, applied to poll-based sync as defense-in-depth
 * alongside the caller's own `SELECT ... FOR UPDATE` account-level lock).
 */

export interface UpsertCampaignInput {
  workspaceId: string;
  adAccountId: string;
  externalId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  dailyBudget: bigint | null;
  lifetimeBudget: bigint | null;
  budgetRemaining: bigint | null;
  startTime: Date | null;
  stopTime: Date | null;
  sourceUpdatedAt: Date | null;
}

/** True when `incoming` must not overwrite `existing` — a stale/out-of-order write
 *  (meta-threat-model.md #15). A `null` incoming or existing timestamp never blocks the
 *  write (a resource with no `updated_time` yet, or seen for the first time, always writes). */
function isStaleWrite(
  existingSourceUpdatedAt: Date | null,
  incomingSourceUpdatedAt: Date | null,
): boolean {
  if (!existingSourceUpdatedAt || !incomingSourceUpdatedAt) return false;
  return incomingSourceUpdatedAt.getTime() < existingSourceUpdatedAt.getTime();
}

export async function upsertCampaign(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertCampaignInput,
): Promise<{ campaign: Campaign; skippedStale: boolean }> {
  return withConflictRetry(async () => {
    const existing = await prisma.campaign.findUnique({
      where: {
        workspaceId_externalId: { workspaceId: input.workspaceId, externalId: input.externalId },
      },
    });

    if (existing && isStaleWrite(existing.sourceUpdatedAt, input.sourceUpdatedAt)) {
      const campaign = await prisma.campaign.update({
        where: { id: existing.id },
        data: { lastSyncedAt: new Date() },
      });
      return { campaign, skippedStale: true };
    }

    const data = {
      adAccountId: input.adAccountId,
      name: input.name,
      status: input.status,
      effectiveStatus: input.effectiveStatus,
      objective: input.objective,
      dailyBudget: input.dailyBudget,
      lifetimeBudget: input.lifetimeBudget,
      budgetRemaining: input.budgetRemaining,
      startTime: input.startTime,
      stopTime: input.stopTime,
      sourceUpdatedAt: input.sourceUpdatedAt,
      lifecycleStatus: "ACTIVE" as const,
      lastSyncedAt: new Date(),
    };

    const campaign = existing
      ? await prisma.campaign.update({ where: { id: existing.id }, data })
      : await prisma.campaign.create({
          data: { workspaceId: input.workspaceId, externalId: input.externalId, ...data },
        });

    return { campaign, skippedStale: false };
  });
}

export interface UpsertAdSetInput {
  workspaceId: string;
  campaignId: string;
  externalId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
  dailyBudget: bigint | null;
  lifetimeBudget: bigint | null;
  startTime: Date | null;
  endTime: Date | null;
  sourceUpdatedAt: Date | null;
}

export async function upsertAdSet(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertAdSetInput,
): Promise<{ adSet: AdSet; skippedStale: boolean }> {
  return withConflictRetry(async () => {
    const existing = await prisma.adSet.findUnique({
      where: {
        workspaceId_externalId: { workspaceId: input.workspaceId, externalId: input.externalId },
      },
    });

    if (existing && isStaleWrite(existing.sourceUpdatedAt, input.sourceUpdatedAt)) {
      const adSet = await prisma.adSet.update({
        where: { id: existing.id },
        data: { lastSyncedAt: new Date() },
      });
      return { adSet, skippedStale: true };
    }

    const data = {
      campaignId: input.campaignId,
      name: input.name,
      status: input.status,
      effectiveStatus: input.effectiveStatus,
      optimizationGoal: input.optimizationGoal,
      billingEvent: input.billingEvent,
      bidStrategy: input.bidStrategy,
      dailyBudget: input.dailyBudget,
      lifetimeBudget: input.lifetimeBudget,
      startTime: input.startTime,
      endTime: input.endTime,
      sourceUpdatedAt: input.sourceUpdatedAt,
      lifecycleStatus: "ACTIVE" as const,
      lastSyncedAt: new Date(),
    };

    const adSet = existing
      ? await prisma.adSet.update({ where: { id: existing.id }, data })
      : await prisma.adSet.create({
          data: { workspaceId: input.workspaceId, externalId: input.externalId, ...data },
        });

    return { adSet, skippedStale: false };
  });
}

export interface UpsertAdInput {
  workspaceId: string;
  adSetId: string;
  externalId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  creativeExternalId: string | null;
  creativeName: string | null;
  sourceUpdatedAt: Date | null;
}

export async function upsertAd(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertAdInput,
): Promise<{ ad: Ad; skippedStale: boolean }> {
  return withConflictRetry(async () => {
    const existing = await prisma.ad.findUnique({
      where: {
        workspaceId_externalId: { workspaceId: input.workspaceId, externalId: input.externalId },
      },
    });

    if (existing && isStaleWrite(existing.sourceUpdatedAt, input.sourceUpdatedAt)) {
      const ad = await prisma.ad.update({
        where: { id: existing.id },
        data: { lastSyncedAt: new Date() },
      });
      return { ad, skippedStale: true };
    }

    const data = {
      adSetId: input.adSetId,
      name: input.name,
      status: input.status,
      effectiveStatus: input.effectiveStatus,
      creativeExternalId: input.creativeExternalId,
      creativeName: input.creativeName,
      sourceUpdatedAt: input.sourceUpdatedAt,
      lifecycleStatus: "ACTIVE" as const,
      lastSyncedAt: new Date(),
    };

    const ad = existing
      ? await prisma.ad.update({ where: { id: existing.id }, data })
      : await prisma.ad.create({
          data: { workspaceId: input.workspaceId, externalId: input.externalId, ...data },
        });

    return { ad, skippedStale: false };
  });
}

/** Marks every currently-`ACTIVE` Campaign under `adAccountId` whose `externalId` is not in
 *  `stillPresentExternalIds` as `EXTERNALLY_REMOVED` (meta-resource-model.md §5) — never a
 *  hard delete. Returns the count marked, for `MetaSyncRun` bookkeeping. */
export async function markMissingCampaignsRemoved(
  prisma: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  adAccountId: string,
  stillPresentExternalIds: string[],
): Promise<number> {
  const result = await prisma.campaign.updateMany({
    where: {
      workspaceId,
      adAccountId,
      lifecycleStatus: "ACTIVE",
      externalId: { notIn: stillPresentExternalIds },
    },
    data: { lifecycleStatus: "EXTERNALLY_REMOVED" },
  });
  return result.count;
}

export async function markMissingAdSetsRemoved(
  prisma: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  campaignId: string,
  stillPresentExternalIds: string[],
): Promise<number> {
  const result = await prisma.adSet.updateMany({
    where: {
      workspaceId,
      campaignId,
      lifecycleStatus: "ACTIVE",
      externalId: { notIn: stillPresentExternalIds },
    },
    data: { lifecycleStatus: "EXTERNALLY_REMOVED" },
  });
  return result.count;
}

export async function markMissingAdsRemoved(
  prisma: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  adSetId: string,
  stillPresentExternalIds: string[],
): Promise<number> {
  const result = await prisma.ad.updateMany({
    where: {
      workspaceId,
      adSetId,
      lifecycleStatus: "ACTIVE",
      externalId: { notIn: stillPresentExternalIds },
    },
    data: { lifecycleStatus: "EXTERNALLY_REMOVED" },
  });
  return result.count;
}

export interface ListSyncedResourcesOptions {
  includeRemoved?: boolean;
}

export async function listCampaignsByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts: ListSyncedResourcesOptions & { adAccountId?: string } = {},
): Promise<Campaign[]> {
  return prisma.campaign.findMany({
    where: {
      workspaceId,
      ...(opts.adAccountId ? { adAccountId: opts.adAccountId } : {}),
      ...(opts.includeRemoved ? {} : { lifecycleStatus: "ACTIVE" }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findCampaignByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  campaignId: string,
): Promise<Campaign | null> {
  return prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
}

export async function listAdSetsByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts: ListSyncedResourcesOptions & { campaignId?: string } = {},
): Promise<AdSet[]> {
  return prisma.adSet.findMany({
    where: {
      workspaceId,
      ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
      ...(opts.includeRemoved ? {} : { lifecycleStatus: "ACTIVE" }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findAdSetByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  adSetId: string,
): Promise<AdSet | null> {
  return prisma.adSet.findFirst({ where: { id: adSetId, workspaceId } });
}

export async function listAdsByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts: ListSyncedResourcesOptions & { adSetId?: string } = {},
): Promise<Ad[]> {
  return prisma.ad.findMany({
    where: {
      workspaceId,
      ...(opts.adSetId ? { adSetId: opts.adSetId } : {}),
      ...(opts.includeRemoved ? {} : { lifecycleStatus: "ACTIVE" }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findAdByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  adId: string,
): Promise<Ad | null> {
  return prisma.ad.findFirst({ where: { id: adId, workspaceId } });
}
