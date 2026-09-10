import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import { closeRedisConnection } from "@ai-marketing-manager/queue";
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
const TEST_META_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
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

async function seedWorkspaceWithOwner(name = "Meta Discovery Test Workspace") {
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

/** Fast-seeds a `CONNECTED` MetaConnection directly (bypassing the full OAuth round-trip
 *  already covered by `api-meta.test.ts`) so discovery/selection tests can focus on their
 *  own concern. */
async function seedConnectedWorkspace(name = "Meta Discovery Test Workspace") {
  const { workspace, owner, ownerClerkUserId } = await seedWorkspaceWithOwner(name);
  const connection = await upsertMetaConnection(prisma, {
    workspaceId: workspace.id,
    externalUserId: "meta_ext_user_disco",
    accessToken: REAL_META_ACCESS_TOKEN,
    scopes: ["ads_read", "ads_management", "business_management"],
    tokenExpiresAt: null,
    encryptionKey: TEST_META_ENCRYPTION_KEY,
    actorUserId: owner.userId,
    correlationId: null,
  });
  return { workspace, owner, ownerClerkUserId, connection };
}

function fetchOk(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function businessesPage(
  businesses: Array<{ id: string; name: string; verification_status?: string }>,
  next?: string,
) {
  return fetchOk({ data: businesses, paging: next ? { next } : {} });
}

function adAccountsPage(
  accounts: Array<{
    id: string;
    account_id: string;
    name: string;
    currency: string;
    timezone_name: string;
    account_status: number;
    business?: { id: string; name: string };
  }>,
  next?: string,
) {
  return fetchOk({ data: accounts, paging: next ? { next } : {} });
}

const SAMPLE_AD_ACCOUNT = {
  id: "act_1001",
  account_id: "1001",
  name: "Sample Ad Account",
  currency: "USD",
  timezone_name: "America/Los_Angeles",
  account_status: 1,
  business: { id: "biz_1", name: "Sample Business" },
};

describe("Meta Business & Ad Account discovery API (Phase 3.2)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

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
    const logger = createLogger({ serviceName: "test-api-meta-discovery", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    verifyToken.mockReset();
    vi.unstubAllGlobals();
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

  describe("GET /workspaces/:id/meta/businesses", () => {
    it("[successful businesses] returns normalized businesses", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        businessesPage([{ id: "biz_1", name: "Acme Ads", verification_status: "verified" }]),
      );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.businesses).toEqual([
        { id: "biz_1", name: "Acme Ads", verificationStatus: "verified" },
      ]);
    });

    it("[paginated businesses] follows paging.next across pages", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock
        .mockImplementationOnce(() =>
          businessesPage(
            [{ id: "biz_1", name: "Page One Business" }],
            "https://graph.facebook.com/v25.0/me/businesses?after=cursor1",
          ),
        )
        .mockImplementationOnce(() => businessesPage([{ id: "biz_2", name: "Page Two Business" }]));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const ids = response.json().data.businesses.map((b: { id: string }) => b.id);
      expect(ids).toEqual(["biz_1", "biz_2"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("[empty result] returns an empty list, not an error", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => businessesPage([]));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.businesses).toEqual([]);
    });

    it("[Meta provider failure] a 5xx is normalized, never exposes the raw body", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        fetchOk({ error: { message: "Service unavailable", code: 2 } }, 503),
      );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(JSON.stringify(response.json())).not.toContain("Service unavailable");
    });

    it("[rate limit] a 429 maps to RATE_LIMITED", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        fetchOk({ error: { message: "Too many calls", code: 17 } }, 429),
      );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error.code).toBe("RATE_LIMITED");
    });

    it("[timeout] a network-level fetch rejection is handled without crashing", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error("fetch failed: ETIMEDOUT")));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("PROVIDER_UNAVAILABLE");
    });

    it("[invalid credential] no Meta connection at all returns 404, never calls Meta", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("[invalid credential] a DISCONNECTED connection returns 409, never calls Meta", async () => {
      const { workspace, owner, ownerClerkUserId } = await seedConnectedWorkspace();
      await prisma.metaConnection.update({
        where: { workspaceId: workspace.id },
        data: {
          status: "DISCONNECTED",
          credentialCiphertext: null,
          credentialIv: null,
          credentialAuthTag: null,
          disconnectedAt: new Date(),
        },
      });
      void owner;

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("no session returns 401", async () => {
      const { workspace } = await seedConnectedWorkspace();
      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
      });
      expect(response.statusCode).toBe(401);
    });

    it("[non-member] a non-member cannot discover another workspace's businesses", async () => {
      const { workspace } = await seedConnectedWorkspace();
      const attackerClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: attackerClerkUserId });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/businesses`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /workspaces/:id/meta/ad-accounts (discovery)", () => {
    it("[successful ad accounts] returns normalized accounts with alreadySelected", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccounts).toEqual([
        {
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "America/Los_Angeles",
          accountStatus: "ACTIVE",
          businessExternalId: "biz_1",
          businessName: "Sample Business",
          alreadySelected: false,
        },
      ]);
    });

    it("[alreadySelected] reflects a previously-persisted selection", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      await prisma.adAccount.create({
        data: {
          workspaceId: workspace.id,
          metaConnectionId: connection.id,
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "America/Los_Angeles",
          accountStatus: "ACTIVE",
        },
      });
      void owner;
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.json().data.adAccounts[0].alreadySelected).toBe(true);
    });

    it("[paginated ad accounts] follows paging.next across pages", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock
        .mockImplementationOnce(() =>
          adAccountsPage(
            [{ ...SAMPLE_AD_ACCOUNT, id: "act_1001", account_id: "1001" }],
            "https://graph.facebook.com/v25.0/me/adaccounts?after=cursor1",
          ),
        )
        .mockImplementationOnce(() =>
          adAccountsPage([{ ...SAMPLE_AD_ACCOUNT, id: "act_1002", account_id: "1002" }]),
        );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const ids = response.json().data.adAccounts.map((a: { externalId: string }) => a.externalId);
      expect(ids).toEqual(["act_1001", "act_1002"]);
    });

    it("[disabled account] a disabled account still appears, normalized, not omitted", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        adAccountsPage([{ ...SAMPLE_AD_ACCOUNT, account_status: 2, business: undefined }]),
      );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.json().data.adAccounts[0].accountStatus).toBe("DISABLED");
      expect(response.json().data.adAccounts[0].businessExternalId).toBeNull();
    });

    it("[unrecognized account_status] normalizes an unknown future code to UNKNOWN, never crashes", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        adAccountsPage([{ ...SAMPLE_AD_ACCOUNT, account_status: 9999 }]),
      );

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccounts[0].accountStatus).toBe("UNKNOWN");
    });

    it("[forbidden role] a VIEWER can still read discovery (meta_connection.read is ALL_ROLES)", async () => {
      const { workspace, owner, ownerClerkUserId } = await seedConnectedWorkspace();
      const viewer = await addMember(workspace.id, "VIEWER", owner.userId);
      void ownerClerkUserId;
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/ad-accounts`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /workspaces/:id/meta/ad-accounts/select", () => {
    it("[valid account selection] persists a single selected account", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccounts).toHaveLength(1);
      expect(response.json().data.adAccounts[0].externalId).toBe("act_1001");
      expect(response.json().data.adAccounts[0].status).toBe("ACTIVE");

      const row = await prisma.adAccount.findUnique({
        where: { workspaceId_externalId: { workspaceId: workspace.id, externalId: "act_1001" } },
      });
      expect(row).not.toBeNull();
      expect(row?.status).toBe("ACTIVE");
    });

    it("[multiple account selection] persists several accounts in one call", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() =>
        adAccountsPage([
          { ...SAMPLE_AD_ACCOUNT, id: "act_1001", account_id: "1001" },
          { ...SAMPLE_AD_ACCOUNT, id: "act_1002", account_id: "1002" },
        ]),
      );

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001", "act_1002"] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccounts).toHaveLength(2);
      const count = await prisma.adAccount.count({ where: { workspaceId: workspace.id } });
      expect(count).toBe(2);
    });

    it("[duplicate selection] re-selecting an already-ACTIVE account is idempotent, not duplicated", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]))
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const first = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });
      const second = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const count = await prisma.adAccount.count({ where: { workspaceId: workspace.id } });
      expect(count).toBe(1);
    });

    it("[reselect after deselect] reactivates the same row rather than duplicating it", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      const existing = await prisma.adAccount.create({
        data: {
          workspaceId: workspace.id,
          metaConnectionId: connection.id,
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "America/Los_Angeles",
          accountStatus: "ACTIVE",
          status: "DESELECTED",
          deselectedAt: new Date(),
        },
      });
      void owner;
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      expect(response.statusCode).toBe(200);
      const count = await prisma.adAccount.count({ where: { workspaceId: workspace.id } });
      expect(count).toBe(1);
      const row = await prisma.adAccount.findUnique({ where: { id: existing.id } });
      expect(row?.status).toBe("ACTIVE");
      expect(row?.deselectedAt).toBeNull();
    });

    it("[unknown Meta account] an externalId not returned by discovery is rejected, nothing persisted", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_9999_not_real"] },
      });

      expect(response.statusCode).toBe(422);
      const count = await prisma.adAccount.count({ where: { workspaceId: workspace.id } });
      expect(count).toBe(0);
    });

    it("[malicious external ID] an empty-string ID is rejected by validation before any Meta call", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: [""] },
      });

      expect(response.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("[account belonging to another workspace] selecting the same external ID in workspace A never affects workspace B", async () => {
      const a = await seedConnectedWorkspace("Workspace A");
      const b = await seedConnectedWorkspace("Workspace B");
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${a.workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(a.ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      expect(response.statusCode).toBe(200);
      const bCount = await prisma.adAccount.count({ where: { workspaceId: b.workspace.id } });
      expect(bCount).toBe(0);
      const aRow = await prisma.adAccount.findUnique({
        where: { workspaceId_externalId: { workspaceId: a.workspace.id, externalId: "act_1001" } },
      });
      expect(aRow).not.toBeNull();
    });

    it("[forbidden role] a VIEWER (lacks meta_connection.connect) is rejected", async () => {
      const { workspace, owner } = await seedConnectedWorkspace();
      const viewer = await addMember(workspace.id, "VIEWER", owner.userId);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(viewer.clerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("no session returns 401", async () => {
      const { workspace } = await seedConnectedWorkspace();
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        payload: { externalIds: ["act_1001"] },
      });
      expect(response.statusCode).toBe(401);
    });

    it("[token security] no audit event ever stores the raw access token", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock.mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { externalIds: ["act_1001"] },
      });

      const events = await prisma.auditEvent.findMany({ where: { workspaceId: workspace.id } });
      for (const event of events) {
        expect(JSON.stringify(event.metadata)).not.toContain(REAL_META_ACCESS_TOKEN);
      }
    });

    it("[concurrency] simultaneous selection of the same new account creates exactly one row", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();
      fetchMock
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]))
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
          headers: await authHeaders(ownerClerkUserId),
          payload: { externalIds: ["act_1001"] },
        }),
        app.inject({
          method: "POST",
          url: `/workspaces/${workspace.id}/meta/ad-accounts/select`,
          headers: await authHeaders(ownerClerkUserId),
          payload: { externalIds: ["act_1001"] },
        }),
      ]);

      expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
      const count = await prisma.adAccount.count({ where: { workspaceId: workspace.id } });
      expect(count).toBe(1);
    });

    it("[concurrency] simultaneous selection of the same external ID in two different workspaces creates two independent rows", async () => {
      const a = await seedConnectedWorkspace("Concurrent Workspace A");
      const b = await seedConnectedWorkspace("Concurrent Workspace B");
      fetchMock
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]))
        .mockImplementationOnce(() => adAccountsPage([SAMPLE_AD_ACCOUNT]));

      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/workspaces/${a.workspace.id}/meta/ad-accounts/select`,
          headers: await authHeaders(a.ownerClerkUserId),
          payload: { externalIds: ["act_1001"] },
        }),
        app.inject({
          method: "POST",
          url: `/workspaces/${b.workspace.id}/meta/ad-accounts/select`,
          headers: await authHeaders(b.ownerClerkUserId),
          payload: { externalIds: ["act_1001"] },
        }),
      ]);

      expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
      const aCount = await prisma.adAccount.count({ where: { workspaceId: a.workspace.id } });
      const bCount = await prisma.adAccount.count({ where: { workspaceId: b.workspace.id } });
      expect(aCount).toBe(1);
      expect(bCount).toBe(1);
    });
  });

  describe("GET /workspaces/:id/ad-accounts (persisted list)", () => {
    it("lists only ACTIVE selected accounts, excludes DESELECTED", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      await prisma.adAccount.createMany({
        data: [
          {
            workspaceId: workspace.id,
            metaConnectionId: connection.id,
            externalId: "act_active",
            name: "Active Account",
            currency: "USD",
            timezone: "UTC",
            accountStatus: "ACTIVE",
            status: "ACTIVE",
          },
          {
            workspaceId: workspace.id,
            metaConnectionId: connection.id,
            externalId: "act_deselected",
            name: "Deselected Account",
            currency: "USD",
            timezone: "UTC",
            accountStatus: "ACTIVE",
            status: "DESELECTED",
            deselectedAt: new Date(),
          },
        ],
      });
      void owner;

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const externalIds = response
        .json()
        .data.adAccounts.map((a: { externalId: string }) => a.externalId);
      expect(externalIds).toEqual(["act_active"]);
    });

    it("[token security] the list response never includes credential fields", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      await prisma.adAccount.create({
        data: {
          workspaceId: workspace.id,
          metaConnectionId: connection.id,
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "UTC",
          accountStatus: "ACTIVE",
        },
      });
      void owner;

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const raw = JSON.stringify(response.json());
      expect(raw).not.toContain("credentialCiphertext");
      expect(raw).not.toContain(REAL_META_ACCESS_TOKEN);
    });

    it("[tenant isolation] a non-member cannot list another workspace's ad accounts", async () => {
      const { workspace } = await seedConnectedWorkspace();
      const attackerClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: attackerClerkUserId });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ad-accounts`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("does not require a live/CONNECTED Meta connection to read the persisted list", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      await prisma.adAccount.create({
        data: {
          workspaceId: workspace.id,
          metaConnectionId: connection.id,
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "UTC",
          accountStatus: "ACTIVE",
        },
      });
      await prisma.metaConnection.update({
        where: { workspaceId: workspace.id },
        data: {
          status: "DISCONNECTED",
          credentialCiphertext: null,
          credentialIv: null,
          credentialAuthTag: null,
          disconnectedAt: new Date(),
        },
      });
      void owner;

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/ad-accounts`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccounts).toHaveLength(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /workspaces/:id/ad-accounts/:adAccountId (deselection)", () => {
    async function seedSelectedAccount(workspaceId: string, metaConnectionId: string) {
      return prisma.adAccount.create({
        data: {
          workspaceId,
          metaConnectionId,
          externalId: "act_1001",
          name: "Sample Ad Account",
          currency: "USD",
          timezone: "UTC",
          accountStatus: "ACTIVE",
        },
      });
    }

    it("deselects successfully — status becomes DESELECTED, row preserved", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      const account = await seedSelectedAccount(workspace.id, connection.id);
      void owner;

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.adAccount.status).toBe("DESELECTED");
      const row = await prisma.adAccount.findUnique({ where: { id: account.id } });
      expect(row).not.toBeNull();
      expect(row?.status).toBe("DESELECTED");
    });

    it("[already deselected] deselecting twice returns 409 the second time", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      const account = await seedSelectedAccount(workspace.id, connection.id);
      void owner;

      const first = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });
      const second = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(409);
    });

    it("[no account] returns 404", async () => {
      const { workspace, ownerClerkUserId } = await seedConnectedWorkspace();

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${randomUUID()}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
    });

    it("[forbidden role] a VIEWER (lacks meta_connection.disconnect) is rejected", async () => {
      const { workspace, owner, connection } = await seedConnectedWorkspace();
      const account = await seedSelectedAccount(workspace.id, connection.id);
      const viewer = await addMember(workspace.id, "VIEWER", owner.userId);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[cross-workspace / tenant isolation] workspace B cannot deselect workspace A's ad account — a known ID alone never authorizes access", async () => {
      const a = await seedConnectedWorkspace("Deselect Workspace A");
      const b = await seedConnectedWorkspace("Deselect Workspace B");
      const account = await seedSelectedAccount(a.workspace.id, a.connection.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${b.workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(b.ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
      const row = await prisma.adAccount.findUnique({ where: { id: account.id } });
      expect(row?.status).toBe("ACTIVE");
    });

    it("[audit] deselection is audited", async () => {
      const { workspace, owner, ownerClerkUserId, connection } = await seedConnectedWorkspace();
      const account = await seedSelectedAccount(workspace.id, connection.id);
      void owner;

      await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/ad-accounts/${account.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const events = await prisma.auditEvent.findMany({
        where: { workspaceId: workspace.id, eventType: "ad_account.deselected" },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.resourceId).toBe(account.id);
    });
  });

  describe("Regression — Phase 3.1 tenant-isolation pattern still holds for ad accounts", () => {
    it("knowing another workspace's ad-account internal ID grants no read access via the discovery/select routes", async () => {
      const a = await seedConnectedWorkspace("Regression Workspace A");
      const b = await seedConnectedWorkspace("Regression Workspace B");
      const accountA = await prisma.adAccount.create({
        data: {
          workspaceId: a.workspace.id,
          metaConnectionId: a.connection.id,
          externalId: "act_secret",
          name: "Workspace A's Account",
          currency: "USD",
          timezone: "UTC",
          accountStatus: "ACTIVE",
        },
      });

      const listResponse = await app.inject({
        method: "GET",
        url: `/workspaces/${b.workspace.id}/ad-accounts`,
        headers: await authHeaders(b.ownerClerkUserId),
      });
      expect(
        listResponse.json().data.adAccounts.some((acct: { id: string }) => acct.id === accountA.id),
      ).toBe(false);

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/workspaces/${b.workspace.id}/ad-accounts/${accountA.id}`,
        headers: await authHeaders(b.ownerClerkUserId),
      });
      expect(deleteResponse.statusCode).toBe(404);
    });
  });
});
