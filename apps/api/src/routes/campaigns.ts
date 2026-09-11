import type { FastifyInstance } from "fastify";
import {
  listCampaignsResponseSchema,
  getCampaignResponseSchema,
  listAdSetsResponseSchema,
  getAdSetResponseSchema,
  listAdsResponseSchema,
  getAdResponseSchema,
  successEnvelope,
  errorEnvelope,
  type CampaignSummary,
  type AdSetSummary,
  type AdSummary,
} from "@ai-marketing-manager/contracts";
import {
  getPrismaClient,
  listCampaignsByWorkspace,
  findCampaignByWorkspace,
  listAdSetsByWorkspace,
  findAdSetByWorkspace,
  listAdsByWorkspace,
  findAdByWorkspace,
  type Campaign,
  type AdSet,
  type Ad,
} from "@ai-marketing-manager/domain";
import {
  requireAuth,
  requireWorkspaceMembership,
  requirePermission,
} from "../plugins/authorization.js";
import type { ApiEnv } from "../env.js";

export interface CampaignsRouteOptions {
  env: ApiEnv;
}

/** `bigint` has no native JSON representation — serialized as a decimal string, `null` only
 *  for a genuinely absent value, never `undefined` (money-handling rule, meta-resource-
 *  model.md §4). */
function bigIntToString(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

function toCampaignSummary(campaign: Campaign): CampaignSummary {
  return {
    id: campaign.id,
    adAccountId: campaign.adAccountId,
    externalId: campaign.externalId,
    name: campaign.name,
    status: campaign.status,
    effectiveStatus: campaign.effectiveStatus,
    objective: campaign.objective,
    dailyBudget: bigIntToString(campaign.dailyBudget),
    lifetimeBudget: bigIntToString(campaign.lifetimeBudget),
    budgetRemaining: bigIntToString(campaign.budgetRemaining),
    startTime: campaign.startTime?.toISOString() ?? null,
    stopTime: campaign.stopTime?.toISOString() ?? null,
    sourceUpdatedAt: campaign.sourceUpdatedAt?.toISOString() ?? null,
    lifecycleStatus: campaign.lifecycleStatus,
    lastSyncedAt: campaign.lastSyncedAt.toISOString(),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function toAdSetSummary(adSet: AdSet): AdSetSummary {
  return {
    id: adSet.id,
    campaignId: adSet.campaignId,
    externalId: adSet.externalId,
    name: adSet.name,
    status: adSet.status,
    effectiveStatus: adSet.effectiveStatus,
    optimizationGoal: adSet.optimizationGoal,
    billingEvent: adSet.billingEvent,
    bidStrategy: adSet.bidStrategy,
    dailyBudget: bigIntToString(adSet.dailyBudget),
    lifetimeBudget: bigIntToString(adSet.lifetimeBudget),
    startTime: adSet.startTime?.toISOString() ?? null,
    endTime: adSet.endTime?.toISOString() ?? null,
    sourceUpdatedAt: adSet.sourceUpdatedAt?.toISOString() ?? null,
    lifecycleStatus: adSet.lifecycleStatus,
    lastSyncedAt: adSet.lastSyncedAt.toISOString(),
    createdAt: adSet.createdAt.toISOString(),
    updatedAt: adSet.updatedAt.toISOString(),
  };
}

function toAdSummary(ad: Ad): AdSummary {
  return {
    id: ad.id,
    adSetId: ad.adSetId,
    externalId: ad.externalId,
    name: ad.name,
    status: ad.status,
    effectiveStatus: ad.effectiveStatus,
    creativeExternalId: ad.creativeExternalId,
    creativeName: ad.creativeName,
    sourceUpdatedAt: ad.sourceUpdatedAt?.toISOString() ?? null,
    lifecycleStatus: ad.lifecycleStatus,
    lastSyncedAt: ad.lastSyncedAt.toISOString(),
    createdAt: ad.createdAt.toISOString(),
    updatedAt: ad.updatedAt.toISOString(),
  };
}

/**
 * Read-only Campaign/Ad Set/Ad API (Phase 4.1, meta-api-contracts.md §1's Phase 4.1
 * addendum) — the persisted, synced campaign hierarchy. No create/update/delete (OD-3A-09:
 * zero Meta mutation capability through Phase 4.1). Every route reuses the unchanged
 * `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read) →
 * requireResourceAccess` chain — no competing authorization path, no RBAC catalog change.
 */
export default async function campaignsRoute(app: FastifyInstance, _opts: CampaignsRouteOptions) {
  app.get<{ Params: { id: string }; Querystring: { adAccountId?: string } }>(
    "/workspaces/:id/campaigns",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const campaigns = await listCampaignsByWorkspace(prisma, workspace.id, {
        adAccountId: request.query.adAccountId,
      });
      const body = listCampaignsResponseSchema.parse({
        campaigns: campaigns.map(toCampaignSummary),
      });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.get<{ Params: { id: string; campaignId: string } }>(
    "/workspaces/:id/campaigns/:campaignId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const campaign = await findCampaignByWorkspace(
        prisma,
        workspace.id,
        request.params.campaignId,
      );
      if (!campaign) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }
      const body = getCampaignResponseSchema.parse({ campaign: toCampaignSummary(campaign) });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.get<{ Params: { id: string }; Querystring: { campaignId?: string } }>(
    "/workspaces/:id/ad-sets",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const adSets = await listAdSetsByWorkspace(prisma, workspace.id, {
        campaignId: request.query.campaignId,
      });
      const body = listAdSetsResponseSchema.parse({ adSets: adSets.map(toAdSetSummary) });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.get<{ Params: { id: string; adSetId: string } }>(
    "/workspaces/:id/ad-sets/:adSetId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const adSet = await findAdSetByWorkspace(prisma, workspace.id, request.params.adSetId);
      if (!adSet) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }
      const body = getAdSetResponseSchema.parse({ adSet: toAdSetSummary(adSet) });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.get<{ Params: { id: string }; Querystring: { adSetId?: string } }>(
    "/workspaces/:id/ads",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const ads = await listAdsByWorkspace(prisma, workspace.id, {
        adSetId: request.query.adSetId,
      });
      const body = listAdsResponseSchema.parse({ ads: ads.map(toAdSummary) });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );

  app.get<{ Params: { id: string; adId: string } }>(
    "/workspaces/:id/ads/:adId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "meta_connection.read");

      const prisma = getPrismaClient();
      const ad = await findAdByWorkspace(prisma, workspace.id, request.params.adId);
      if (!ad) {
        reply.code(404).send(errorEnvelope("NOT_FOUND", "Resource not found.", request.requestId));
        return;
      }
      const body = getAdResponseSchema.parse({ ad: toAdSummary(ad) });
      reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
    },
  );
}
