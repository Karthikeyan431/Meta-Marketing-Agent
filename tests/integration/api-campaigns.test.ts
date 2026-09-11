import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import { closeRedisConnection, createQueue } from "@ai-marketing-manager/queue";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
  upsertMembershipFromSync,
  changeMembershipRole,
  upsertMetaConnection,
} from "@ai-marketing-manager/domain";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

const TEST_SECRET_KEY = "test-fixture-secret-not-a-real-clerk-key";
const TEST_META_APP_ID = "test_meta_app_id";
const TEST_META_APP_SECRET = "test-fixture-meta-app-secret-not-real";
const TEST_META_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
const TEST_META_REDIRECT_URI = "http://localhost:4000/meta/oauth/callback";
const REAL_META_ACCESS_TOKEN = "EAAG-fake-long-lived-access-token-not-a-real-secret";

const prisma = getPrismaClient();
const clerkUserIds: string[] = [];
const clerkOrgIds: string[] = [];

function testClerkUserId(): string {
  const id = `test_user_${randomUUID()}`;
  clerkUserIds.push(id);
  return id;
}
function testClerkOrgId(): string {
  const id = `test_org_${randomUUID()}`;
  clerkOrgIds.push(id);
  return id;
}

async function seedWorkspaceWithOwner(name = "Campaigns Test Workspace") {
  const clerkOrganizationId = testClerkOrgId();
  const ownerClerkUserId = testClerkUserId();
  const { workspace, ownerMembership } = await createWorkspaceWithOwner(prisma, {
    clerkOrganizationId,
    name,
    ownerClerkUserId,
    syncedAt: new Date(),
  });
  return { workspace, owner: ownerMembership!, ownerClerkUserId };
}

async function addMember(
  workspaceId: string,
  role: "ADMIN" | "MANAGER" | "ANALYST" | "VIEWER" = "VIEWER",
  actorUserId?: string,
) {
  const clerkUserId = testClerkUserId();
  const user = await provisionUser(prisma, { clerkUserId });
  const membership = await upsertMembershipFromSync(prisma, {
    workspaceId,
    userId: user.id,
    syncedAt: new Date(),
  });
  const final =
    role === "VIEWER"
      ? membership
      : await changeMembershipRole(prisma, {
          membershipId: membership.id,
          workspaceId,
          newRole: role,
          actorUserId: actorUserId!,
        });
  return { clerkUserId, userId: user.id, membership: final };
}

async function seedConnectedWorkspaceWithAccount(name = "Campaigns Test Workspace") {
  const { workspace, owner, ownerClerkUserId } = await seedWorkspaceWithOwner(name);
  const connection = await upsertMetaConnection(prisma, {
    workspaceId: workspace.id,
    externalUserId: "meta_ext_user_campaigns",
    accessToken: REAL_META_ACCESS_TOKEN,
    scopes: ["ads_read", "ads_management", "business_management"],
    tokenExpiresAt: null,
    encryptionKey: TEST_META_ENCRYPTION_KEY,
    actorUserId: owner.userId,
    correlationId: null,
  });
  const adAccount = await prisma.adAccount.create({
    data: {
      workspaceId: workspace.id,
      metaConnectionId: connection.id,
      externalId: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: "Synced Ad Account",
      currency: "USD",
      timezone: "UTC",
      accountStatus: "ACTIVE",
    },
  });
  return { workspace, owner, ownerClerkUserId, connection, adAccount };
}

async function seedCampaign(
  workspaceId: string,
  adAccountId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.campaign.create({
    data: {
      workspaceId,
      adAccountId,
      externalId: `camp_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      name: "Seeded Campaign",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      objective: "OUTCOME_TRAFFIC",
      dailyBudget: 1000n,
      lastSyncedAt: new Date(),
      ...overrides,
    },
  });
}

async function seedAdSet(
  workspaceId: string,
  campaignId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.adSet.create({
    data: {
      workspaceId,
      campaignId,
      externalId: `adset_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      name: "Seeded Ad Set",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      lastSyncedAt: new Date(),
      ...overrides,
    },
  });
}

async function seedAd(
  workspaceId: string,
  adSetId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.ad.create({
    data: {
      workspaceId,
      adSetId,
      externalId: `ad_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      name: "Seeded Ad",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      lastSyncedAt: new Date(),
      ...overrides,
    },
  });
}

describe("Campaign/Ad Set/Ad read API + sync trigger (Phase 4.1)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const clerkBackendMock = (await import("@clerk/backend")) as unknown as {
      verifyToken: ReturnType<typeof vi.fn>;
    };
    ({ verifyToken } = clerkBackendMock);

    const env = loadApiEnv({
      ...process.env,
      CLERK_SECRET_KEY: TEST_SECRET_KEY,
      META_APP_ID: TEST_META_APP_ID,
      META_APP_SECRET: TEST_META_APP_SECRET,
      META_OAUTH_REDIRECT_URI: TEST_META_REDIRECT_URI,
      META_CREDENTIAL_ENCRYPTION_KEY: TEST_META_ENCRYPTION_KEY,
    });
    const logger = createLogger({ serviceName: "test-api-campaigns", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  beforeEach(() => {
    verifyToken.mockReset();
  });

  afterEach(async () => {
    const queue = createQueue("sync", process.env["REDIS_URL"] ?? "redis://localhost:6380");
    await queue.drain(true);
  });

  afterAll(async () => {
    await app.close();
    await closeRedisConnection();
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  async function authHeaders(clerkUserId: string) {
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId });
    return { authorization: "Bearer token" };
  }

  describe("POST /workspaces/:id/meta/sync", () => {
    it("enqueues one job per active ad account and audits the trigger", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspaceWithAccount();

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/sync`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.enqueued).toBe(1);

      const events = await prisma.auditEvent.findMany({
        where: { workspaceId: workspace.id, eventType: "meta_sync.triggered" },
      });
      expect(events).toHaveLength(1);
    });

    it("returns 0 enqueued and does not audit when there are no selected ad accounts", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/sync`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.enqueued).toBe(0);
      const events = await prisma.auditEvent.findMany({
        where: { workspaceId: workspace.id, eventType: "meta_sync.triggered" },
      });
      expect(events).toHaveLength(0);
    });

    it("no session returns 401", async () => {
      const { workspace } = await seedWorkspaceWithOwner();
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/sync`,
      });
      expect(response.statusCode).toBe(401);
    });

    it("[non-member] a non-member cannot trigger sync for another workspace", async () => {
      const { workspace } = await seedConnectedWorkspaceWithAccount();
      const attackerClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: attackerClerkUserId });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/sync`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[forbidden role does not apply — meta_connection.read is ALL_ROLES] a VIEWER can trigger sync", async () => {
      const { workspace, owner } = await seedConnectedWorkspaceWithAccount();
      const viewer = await addMember(workspace.id, "VIEWER", owner.userId);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/sync`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /workspaces/:id/campaigns", () => {
    it("lists only ACTIVE campaigns for the workspace, excludes EXTERNALLY_REMOVED", async () => {
      const { workspace, ownerClerkUserId, adAccount } = await seedConnectedWorkspaceWithAccount();
      const active = await seedCampaign(workspace.id, adAccount.id, { name: "Active One" });
      await seedCampaign(workspace.id, adAccount.id, {
        name: "Removed One",
        lifecycleStatus: "EXTERNALLY_REMOVED",
      });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const campaigns = response.json().data.campaigns;
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].id).toBe(active.id);
      expect(campaigns[0].dailyBudget).toBe("1000");
    });

    it("filters by adAccountId", async () => {
      const { workspace, ownerClerkUserId, adAccount, connection } =
        await seedConnectedWorkspaceWithAccount();
      const otherAccount = await prisma.adAccount.create({
        data: {
          workspaceId: workspace.id,
          metaConnectionId: connection.id,
          externalId: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          name: "Second Account",
          currency: "USD",
          timezone: "UTC",
          accountStatus: "ACTIVE",
        },
      });
      const campaignA = await seedCampaign(workspace.id, adAccount.id);
      await seedCampaign(workspace.id, otherAccount.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns?adAccountId=${adAccount.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const campaigns = response.json().data.campaigns;
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].id).toBe(campaignA.id);
    });

    it("[tenant isolation] a non-member cannot list another workspace's campaigns", async () => {
      const { workspace } = await seedConnectedWorkspaceWithAccount();
      const attackerClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: attackerClerkUserId });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("no session returns 401", async () => {
      const { workspace } = await seedConnectedWorkspaceWithAccount();
      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns`,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /workspaces/:id/campaigns/:campaignId", () => {
    it("returns a single campaign", async () => {
      const { workspace, ownerClerkUserId, adAccount } = await seedConnectedWorkspaceWithAccount();
      const campaign = await seedCampaign(workspace.id, adAccount.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns/${campaign.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.campaign.id).toBe(campaign.id);
    });

    it("[cross-workspace / tenant isolation] a known campaign ID from another workspace returns 404, not 403", async () => {
      const a = await seedConnectedWorkspaceWithAccount("Campaign Isolation A");
      const b = await seedConnectedWorkspaceWithAccount("Campaign Isolation B");
      const campaignA = await seedCampaign(a.workspace.id, a.adAccount.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${b.workspace.id}/campaigns/${campaignA.id}`,
        headers: await authHeaders(b.ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
    });

    it("[no campaign] returns 404", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspaceWithAccount();
      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/campaigns/${randomUUID()}`,
        headers: await authHeaders(ownerClerkUserId),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /workspaces/:id/ad-sets", () => {
    it("lists ad sets, filterable by campaignId", async () => {
      const { workspace, ownerClerkUserId, adAccount } = await seedConnectedWorkspaceWithAccount();
      const campaign = await seedCampaign(workspace.id, adAccount.id);
      const adSet = await seedAdSet(workspace.id, campaign.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ad-sets?campaignId=${campaign.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const adSets = response.json().data.adSets;
      expect(adSets).toHaveLength(1);
      expect(adSets[0].id).toBe(adSet.id);
    });
  });

  describe("GET /workspaces/:id/ad-sets/:adSetId", () => {
    it("[cross-workspace] a known ad set ID from another workspace returns 404", async () => {
      const a = await seedConnectedWorkspaceWithAccount("AdSet Isolation A");
      const b = await seedConnectedWorkspaceWithAccount("AdSet Isolation B");
      const campaignA = await seedCampaign(a.workspace.id, a.adAccount.id);
      const adSetA = await seedAdSet(a.workspace.id, campaignA.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${b.workspace.id}/ad-sets/${adSetA.id}`,
        headers: await authHeaders(b.ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /workspaces/:id/ads", () => {
    it("lists ads, filterable by adSetId", async () => {
      const { workspace, ownerClerkUserId, adAccount } = await seedConnectedWorkspaceWithAccount();
      const campaign = await seedCampaign(workspace.id, adAccount.id);
      const adSet = await seedAdSet(workspace.id, campaign.id);
      const ad = await seedAd(workspace.id, adSet.id, {
        creativeExternalId: "creative_1",
        creativeName: "A Creative",
      });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ads?adSetId=${adSet.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const ads = response.json().data.ads;
      expect(ads).toHaveLength(1);
      expect(ads[0].id).toBe(ad.id);
      expect(ads[0].creativeName).toBe("A Creative");
    });

    it("[token security] the response never includes credential fields or the raw access token", async () => {
      const { workspace, ownerClerkUserId, adAccount } = await seedConnectedWorkspaceWithAccount();
      const campaign = await seedCampaign(workspace.id, adAccount.id);
      const adSet = await seedAdSet(workspace.id, campaign.id);
      await seedAd(workspace.id, adSet.id);

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ads`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const raw = JSON.stringify(response.json());
      expect(raw).not.toContain("credentialCiphertext");
      expect(raw).not.toContain(REAL_META_ACCESS_TOKEN);
    });
  });

  describe("GET /workspaces/:id/ads/:adId", () => {
    it("[no ad] returns 404", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspaceWithAccount();
      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ads/${randomUUID()}`,
        headers: await authHeaders(ownerClerkUserId),
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
