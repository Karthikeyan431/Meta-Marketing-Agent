import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { closeRedisConnection, createQueue } from "@ai-marketing-manager/queue";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
  upsertMembershipFromSync,
  removeMembershipFromSync,
  upsertMetaConnection,
} from "@ai-marketing-manager/domain";

const TEST_META_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
const REAL_META_ACCESS_TOKEN = "EAAG-fake-long-lived-access-token-not-a-real-secret";

// workers/sync imports @ai-marketing-manager/domain re-exports, so this must be imported
// after the mock (if any) is set up — no domain mock is used here (this suite exercises the
// real sync logic against a real Postgres/Redis instance, matching meta-test-matrix.md §3's
// "security-relevant scenarios ... not solely unit tests against mocked authorization
// helpers", extended here to the worker's real DB/concurrency/idempotency behavior — the
// same category of real defect (P2034, phase-3-2-implementation-report.md §11) that a
// mocked-domain unit test would never have caught).
const { createSyncProcessor } = await import("../../workers/sync/src/processor.js");

const prisma = getPrismaClient();
const clerkUserIds: string[] = [];
const clerkOrgIds: string[] = [];
const logger = createLogger({ serviceName: "test-worker-sync", level: "silent" });

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

async function seedConnectedWorkspaceWithAccount(name = "Sync Worker Test Workspace") {
  const clerkOrganizationId = testClerkOrgId();
  const ownerClerkUserId = testClerkUserId();
  const { workspace, ownerMembership } = await createWorkspaceWithOwner(prisma, {
    clerkOrganizationId,
    name,
    ownerClerkUserId,
    syncedAt: new Date(),
  });
  const owner = ownerMembership!;

  const connection = await upsertMetaConnection(prisma, {
    workspaceId: workspace.id,
    externalUserId: "meta_ext_user_sync",
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

function fetchOk(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function page(data: unknown[]) {
  return fetchOk({ data, paging: {} });
}

function sampleCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: `camp_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    name: "Sample Campaign",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    objective: "OUTCOME_TRAFFIC",
    daily_budget: "1000",
    lifetime_budget: null,
    budget_remaining: "500",
    start_time: "2026-01-01T00:00:00+0000",
    stop_time: null,
    updated_time: "2026-01-01T00:00:00+0000",
    ...overrides,
  };
}

function sampleAdSet(overrides: Record<string, unknown> = {}) {
  return {
    id: `adset_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    name: "Sample Ad Set",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: "500",
    lifetime_budget: null,
    start_time: "2026-01-01T00:00:00+0000",
    end_time: null,
    updated_time: "2026-01-01T00:00:00+0000",
    ...overrides,
  };
}

function sampleAd(overrides: Record<string, unknown> = {}) {
  return {
    id: `ad_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    name: "Sample Ad",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    creative: { id: "creative_1", name: "Sample Creative" },
    updated_time: "2026-01-01T00:00:00+0000",
    ...overrides,
  };
}

/** Queues fetch responses for one full campaign-hierarchy sync: 1 campaign page, 1 ad-set
 *  page (for that campaign), 1 ad page (for that ad set). */
function queueOneFullHierarchy(
  fetchMock: ReturnType<typeof vi.fn>,
  campaign = sampleCampaign(),
  adSet = sampleAdSet(),
  ad = sampleAd(),
) {
  fetchMock
    .mockImplementationOnce(() => page([campaign]))
    .mockImplementationOnce(() => page([adSet]))
    .mockImplementationOnce(() => page([ad]));
  return { campaign, adSet, ad };
}

function fakeJob(name: string, data: unknown) {
  return { id: `job_${randomUUID()}`, name, data } as never;
}

describe("Meta sync worker (Phase 4.1)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await closeRedisConnection();
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  function deps() {
    return {
      logger,
      redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6380",
      metaApiVersion: "v25.0",
      metaCredentialEncryptionKey: TEST_META_ENCRYPTION_KEY,
    };
  }

  function manualPayload(workspaceId: string, adAccountId: string, userId: string) {
    return {
      workspaceId,
      adAccountId,
      initiatingActor: { kind: "user" as const, userId },
      triggerType: "MANUAL" as const,
      correlationId: "test-correlation",
    };
  }

  it("[initial sync] persists the full campaign/ad-set/ad hierarchy", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const { campaign, adSet, ad } = queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId)));

    const campaigns = await prisma.campaign.findMany({ where: { workspaceId: workspace.id } });
    const adSets = await prisma.adSet.findMany({ where: { workspaceId: workspace.id } });
    const ads = await prisma.ad.findMany({ where: { workspaceId: workspace.id } });

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.externalId).toBe(campaign.id);
    expect(campaigns[0]?.dailyBudget).toBe(1000n);
    expect(adSets).toHaveLength(1);
    expect(adSets[0]?.externalId).toBe(adSet.id);
    expect(ads).toHaveLength(1);
    expect(ads[0]?.externalId).toBe(ad.id);
    expect(ads[0]?.creativeExternalId).toBe("creative_1");

    const runs = await prisma.metaSyncRun.findMany({ where: { workspaceId: workspace.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("SUCCEEDED");
    expect(runs[0]?.campaignsSynced).toBe(1);
  });

  it("[duplicate / re-sync] running sync twice with unchanged data does not duplicate rows", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const fixture = queueOneFullHierarchy(fetchMock);
    queueOneFullHierarchy(fetchMock, fixture.campaign, fixture.adSet, fixture.ad);

    const processor = createSyncProcessor(deps());
    const payload = manualPayload(workspace.id, adAccount.id, owner.userId);
    await processor(fakeJob("meta-sync", payload));
    await processor(fakeJob("meta-sync", payload));

    const campaigns = await prisma.campaign.findMany({ where: { workspaceId: workspace.id } });
    const adSets = await prisma.adSet.findMany({ where: { workspaceId: workspace.id } });
    const ads = await prisma.ad.findMany({ where: { workspaceId: workspace.id } });
    expect(campaigns).toHaveLength(1);
    expect(adSets).toHaveLength(1);
    expect(ads).toHaveLength(1);
  });

  it("[deleted resource] a campaign no longer returned by Meta is marked EXTERNALLY_REMOVED, not deleted", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const campaignA = sampleCampaign({ name: "Campaign A" });
    const campaignB = sampleCampaign({ name: "Campaign B" });
    fetchMock
      .mockImplementationOnce(() => page([campaignA, campaignB]))
      .mockImplementationOnce(() => page([]))
      .mockImplementationOnce(() => page([]));

    const processor = createSyncProcessor(deps());
    const payload = manualPayload(workspace.id, adAccount.id, owner.userId);
    await processor(fakeJob("meta-sync", payload));

    // Second pass: only campaignA is still returned.
    fetchMock
      .mockImplementationOnce(() => page([campaignA]))
      .mockImplementationOnce(() => page([]));
    await processor(fakeJob("meta-sync", payload));

    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
    });
    expect(campaigns).toHaveLength(2);
    expect(campaigns.find((c) => c.externalId === campaignA.id)?.lifecycleStatus).toBe("ACTIVE");
    expect(campaigns.find((c) => c.externalId === campaignB.id)?.lifecycleStatus).toBe(
      "EXTERNALLY_REMOVED",
    );
  });

  it("[out-of-order write] a stale update never overwrites newer data", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const campaign = sampleCampaign({
      name: "Newer Name",
      updated_time: "2026-06-01T00:00:00+0000",
    });
    queueOneFullHierarchy(fetchMock, campaign, sampleAdSet(), sampleAd());

    const processor = createSyncProcessor(deps());
    const payload = manualPayload(workspace.id, adAccount.id, owner.userId);
    await processor(fakeJob("meta-sync", payload));

    // A second, out-of-order pass claims an OLDER updated_time with a different name.
    const staleCampaign = {
      ...campaign,
      name: "Stale Older Name",
      updated_time: "2026-01-01T00:00:00+0000",
    };
    fetchMock
      .mockImplementationOnce(() => page([staleCampaign]))
      .mockImplementationOnce(() => page([]));
    await processor(fakeJob("meta-sync", payload));

    const row = await prisma.campaign.findFirst({ where: { workspaceId: workspace.id } });
    expect(row?.name).toBe("Newer Name");
  });

  it("[partial failure] one campaign's ad-set fetch failing does not abort the whole run", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const campaignA = sampleCampaign({ name: "Good Campaign" });
    const campaignB = sampleCampaign({ name: "Bad Campaign" });
    fetchMock
      .mockImplementationOnce(() => page([campaignA, campaignB]))
      // campaignA's ad sets: empty page, succeeds.
      .mockImplementationOnce(() => page([]))
      // campaignB's ad sets: fails.
      .mockImplementationOnce(() => fetchOk({ error: { message: "Service unavailable" } }, 503));

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId)));

    const campaigns = await prisma.campaign.findMany({ where: { workspaceId: workspace.id } });
    expect(campaigns).toHaveLength(2);
    const run = await prisma.metaSyncRun.findFirst({ where: { workspaceId: workspace.id } });
    expect(run?.status).toBe("PARTIAL");
    expect(run?.itemsFailed).toBeGreaterThan(0);
  });

  it("[worker authorization re-verification] a membership removed between enqueue and execution blocks the sync", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    const admin = await provisionUser(prisma, { clerkUserId: testClerkUserId() });
    const membership = await upsertMembershipFromSync(prisma, {
      workspaceId: workspace.id,
      userId: admin.id,
      syncedAt: new Date(),
    });
    // Removed before the job executes — mirrors worker-authorization-contract.md §4's table.
    await removeMembershipFromSync(prisma, {
      workspaceId: workspace.id,
      userId: admin.id,
      syncedAt: new Date(),
    });
    void membership;
    void owner;

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, admin.id)));

    expect(fetchMock).not.toHaveBeenCalled();
    const campaigns = await prisma.campaign.findMany({ where: { workspaceId: workspace.id } });
    expect(campaigns).toHaveLength(0);
  });

  it("[system-triggered sync] a SCHEDULED job (system actor) succeeds using the workspace OWNER for accountability", async () => {
    const { workspace, adAccount } = await seedConnectedWorkspaceWithAccount();
    queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    await processor(
      fakeJob("meta-sync", {
        workspaceId: workspace.id,
        adAccountId: adAccount.id,
        initiatingActor: { kind: "system" as const },
        triggerType: "SCHEDULED" as const,
        correlationId: null,
      }),
    );

    const run = await prisma.metaSyncRun.findFirst({ where: { workspaceId: workspace.id } });
    expect(run?.status).toBe("SUCCEEDED");
    expect(run?.triggerType).toBe("SCHEDULED");
  });

  it("[tenant isolation] workspace A's synced campaigns never appear under workspace B", async () => {
    const a = await seedConnectedWorkspaceWithAccount("Sync Isolation A");
    const b = await seedConnectedWorkspaceWithAccount("Sync Isolation B");
    queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    await processor(
      fakeJob("meta-sync", manualPayload(a.workspace.id, a.adAccount.id, a.owner.userId)),
    );

    const bCampaigns = await prisma.campaign.findMany({ where: { workspaceId: b.workspace.id } });
    expect(bCampaigns).toHaveLength(0);
  });

  it("[connection health] an authentication-shaped failure moves the connection to REAUTH_REQUIRED and does not retry", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    fetchMock.mockImplementationOnce(() =>
      fetchOk({ error: { message: "Invalid OAuth access token.", code: 190 } }, 401),
    );

    const processor = createSyncProcessor(deps());
    await expect(
      processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId))),
    ).resolves.toBeUndefined();

    const connection = await prisma.metaConnection.findUnique({
      where: { workspaceId: workspace.id },
    });
    expect(connection?.status).toBe("REAUTH_REQUIRED");
    const run = await prisma.metaSyncRun.findFirst({ where: { workspaceId: workspace.id } });
    expect(run?.status).toBe("FAILED");
  });

  it("[connection health] a transient failure moves the connection to DEGRADED and propagates for BullMQ retry", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    fetchMock.mockImplementationOnce(() =>
      fetchOk({ error: { message: "Service unavailable" } }, 503),
    );

    const processor = createSyncProcessor(deps());
    await expect(
      processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId))),
    ).rejects.toThrow();

    const connection = await prisma.metaConnection.findUnique({
      where: { workspaceId: workspace.id },
    });
    expect(connection?.status).toBe("DEGRADED");
  });

  it("[connection health recovery] a DEGRADED connection auto-recovers to CONNECTED on the next successful sync", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    await prisma.metaConnection.update({
      where: { workspaceId: workspace.id },
      data: { status: "DEGRADED", errorState: "provider_unavailable" },
    });
    queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId)));

    const connection = await prisma.metaConnection.findUnique({
      where: { workspaceId: workspace.id },
    });
    expect(connection?.status).toBe("CONNECTED");
    expect(connection?.errorState).toBeNull();
  });

  it("[concurrency] two simultaneous sync attempts for the same ad account run exactly once", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    const payload = manualPayload(workspace.id, adAccount.id, owner.userId);
    await Promise.all([
      processor(fakeJob("meta-sync", payload)),
      processor(fakeJob("meta-sync", payload)),
    ]);

    const runs = await prisma.metaSyncRun.findMany({ where: { workspaceId: workspace.id } });
    // Exactly one run actually executed (the other saw tryStartSyncRun() return null and
    // skipped without creating a second run row).
    expect(runs).toHaveLength(1);
    const campaigns = await prisma.campaign.findMany({ where: { workspaceId: workspace.id } });
    expect(campaigns).toHaveLength(1);
  });

  it("[token security] no audit event ever stores the raw access token", async () => {
    const { workspace, owner, adAccount } = await seedConnectedWorkspaceWithAccount();
    queueOneFullHierarchy(fetchMock);

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync", manualPayload(workspace.id, adAccount.id, owner.userId)));

    const events = await prisma.auditEvent.findMany({ where: { workspaceId: workspace.id } });
    for (const event of events) {
      expect(JSON.stringify(event.metadata)).not.toContain(REAL_META_ACCESS_TOKEN);
    }
  });

  it("[scheduler] enumerates active ad accounts across workspaces and enqueues one job per account", async () => {
    const { workspace, adAccount } = await seedConnectedWorkspaceWithAccount(
      "Scheduler Test Workspace",
    );
    const queue = createQueue("sync", deps().redisUrl);
    await queue.drain(true);

    const processor = createSyncProcessor(deps());
    await processor(fakeJob("meta-sync-scheduler", {}));

    const waiting = await queue.getJobs(["waiting"]);
    const forThisAccount = waiting.filter(
      (j) => (j.data as { workspaceId?: string }).workspaceId === workspace.id,
    );
    expect(forThisAccount.length).toBeGreaterThanOrEqual(1);
    expect((forThisAccount[0]?.data as { adAccountId?: string }).adAccountId).toBe(adAccount.id);

    await queue.drain(true);
  });

  it("unrecognized job name throws", async () => {
    const processor = createSyncProcessor(deps());
    await expect(processor(fakeJob("not-a-real-job", {}))).rejects.toThrow(/Unknown job name/);
  });
});
