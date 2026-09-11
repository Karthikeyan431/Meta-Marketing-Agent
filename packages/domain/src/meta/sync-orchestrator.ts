import type { PrismaClient } from "@prisma/client";
import { listCampaigns, listAdSets, listAds } from "./client.js";
import {
  upsertCampaign,
  upsertAdSet,
  upsertAd,
  markMissingCampaignsRemoved,
  markMissingAdSetsRemoved,
  markMissingAdsRemoved,
} from "./campaign-hierarchy.js";

/**
 * The full campaign-hierarchy sync pass for one Ad Account (meta-sync.md §1's "Initial
 * sync"/"Incremental sync" — this same pass serves both, since it is always a full re-list
 * of current Meta state, never a stateful diff). Lives in `packages/domain` (not
 * `workers/sync`) so it stays a pure orchestration over the already-centralized adapter
 * (`client.ts`) and persistence (`campaign-hierarchy.ts`) — the worker's own job only wraps
 * this with authorization re-verification, the `MetaSyncRun`/connection-health bookkeeping,
 * and BullMQ's job lifecycle (kept thin, exactly like `apps/api/src/routes/meta.ts` is a thin
 * orchestration layer over the same underlying functions).
 *
 * A failure fetching the top-level campaign list (or the whole run being interrupted by an
 * uncaught error) propagates to the caller unchanged — that is a whole-run failure, not a
 * per-item one, and the caller (the worker) is responsible for `MetaSyncRun`/connection-
 * health handling of it. A failure fetching one campaign's ad sets, or one ad set's ads, is
 * caught here and counted in `itemsFailed` — meta-sync.md §4: "every item must have an
 * explicit outcome... never collapse partial execution into an undifferentiated success."
 * Retrying a per-item failure within the same pass is deliberately not implemented — the
 * next sync pass (scheduled or manual) gets a fresh, cheap, fully-idempotent attempt at it.
 */

export interface SyncAdAccountHierarchyInput {
  accessToken: string;
  apiVersion: string;
  workspaceId: string;
  /** Internal AdAccount id. */
  adAccountId: string;
  /** Meta's own `act_{id}` form. */
  externalAdAccountId: string;
}

export interface SyncAdAccountHierarchyResult {
  campaignsSynced: number;
  adSetsSynced: number;
  adsSynced: number;
  itemsFailed: number;
  campaignsRemoved: number;
  adSetsRemoved: number;
  adsRemoved: number;
}

export async function syncAdAccountCampaignHierarchy(
  prisma: PrismaClient,
  input: SyncAdAccountHierarchyInput,
): Promise<SyncAdAccountHierarchyResult> {
  const result: SyncAdAccountHierarchyResult = {
    campaignsSynced: 0,
    adSetsSynced: 0,
    adsSynced: 0,
    itemsFailed: 0,
    campaignsRemoved: 0,
    adSetsRemoved: 0,
    adsRemoved: 0,
  };

  // A top-level failure here is a whole-run failure — never caught, propagates to the caller.
  const remoteCampaigns = await listCampaigns({
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    externalAdAccountId: input.externalAdAccountId,
  });

  const presentCampaignExternalIds: string[] = [];

  for (const remoteCampaign of remoteCampaigns) {
    try {
      const { campaign } = await upsertCampaign(prisma, {
        workspaceId: input.workspaceId,
        adAccountId: input.adAccountId,
        externalId: remoteCampaign.id,
        name: remoteCampaign.name,
        status: remoteCampaign.status,
        effectiveStatus: remoteCampaign.effectiveStatus,
        objective: remoteCampaign.objective,
        dailyBudget: remoteCampaign.dailyBudget,
        lifetimeBudget: remoteCampaign.lifetimeBudget,
        budgetRemaining: remoteCampaign.budgetRemaining,
        startTime: remoteCampaign.startTime,
        stopTime: remoteCampaign.stopTime,
        sourceUpdatedAt: remoteCampaign.updatedTime,
      });
      presentCampaignExternalIds.push(remoteCampaign.id);
      result.campaignsSynced += 1;

      const remoteAdSets = await listAdSets({
        accessToken: input.accessToken,
        apiVersion: input.apiVersion,
        externalCampaignId: remoteCampaign.id,
      });
      const presentAdSetExternalIds: string[] = [];

      for (const remoteAdSet of remoteAdSets) {
        try {
          const { adSet } = await upsertAdSet(prisma, {
            workspaceId: input.workspaceId,
            campaignId: campaign.id,
            externalId: remoteAdSet.id,
            name: remoteAdSet.name,
            status: remoteAdSet.status,
            effectiveStatus: remoteAdSet.effectiveStatus,
            optimizationGoal: remoteAdSet.optimizationGoal,
            billingEvent: remoteAdSet.billingEvent,
            bidStrategy: remoteAdSet.bidStrategy,
            dailyBudget: remoteAdSet.dailyBudget,
            lifetimeBudget: remoteAdSet.lifetimeBudget,
            startTime: remoteAdSet.startTime,
            endTime: remoteAdSet.endTime,
            sourceUpdatedAt: remoteAdSet.updatedTime,
          });
          presentAdSetExternalIds.push(remoteAdSet.id);
          result.adSetsSynced += 1;

          const remoteAds = await listAds({
            accessToken: input.accessToken,
            apiVersion: input.apiVersion,
            externalAdSetId: remoteAdSet.id,
          });
          const presentAdExternalIds: string[] = [];

          for (const remoteAd of remoteAds) {
            try {
              await upsertAd(prisma, {
                workspaceId: input.workspaceId,
                adSetId: adSet.id,
                externalId: remoteAd.id,
                name: remoteAd.name,
                status: remoteAd.status,
                effectiveStatus: remoteAd.effectiveStatus,
                creativeExternalId: remoteAd.creative?.id ?? null,
                creativeName: remoteAd.creative?.name ?? null,
                sourceUpdatedAt: remoteAd.updatedTime,
              });
              presentAdExternalIds.push(remoteAd.id);
              result.adsSynced += 1;
            } catch {
              result.itemsFailed += 1;
            }
          }

          result.adsRemoved += await markMissingAdsRemoved(
            prisma,
            input.workspaceId,
            adSet.id,
            presentAdExternalIds,
          );
        } catch {
          result.itemsFailed += 1;
        }
      }

      result.adSetsRemoved += await markMissingAdSetsRemoved(
        prisma,
        input.workspaceId,
        campaign.id,
        presentAdSetExternalIds,
      );
    } catch {
      result.itemsFailed += 1;
    }
  }

  result.campaignsRemoved += await markMissingCampaignsRemoved(
    prisma,
    input.workspaceId,
    input.adAccountId,
    presentCampaignExternalIds,
  );

  return result;
}
