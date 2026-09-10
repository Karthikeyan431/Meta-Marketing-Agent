import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import { closeRedisConnection, getRedisConnection } from "@ai-marketing-manager/queue";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
  upsertMembershipFromSync,
  changeMembershipRole,
} from "@ai-marketing-manager/domain";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

const TEST_SECRET_KEY = "test-fixture-secret-not-a-real-clerk-key";
const TEST_META_APP_ID = "test_meta_app_id";
const TEST_META_APP_SECRET = "test-fixture-meta-app-secret-not-real";
const TEST_META_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
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

async function seedWorkspaceWithOwner(name = "Meta Test Workspace") {
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

function fetchOk(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const VALID_DEBUG_TOKEN_RESPONSE = {
  data: {
    is_valid: true,
    app_id: TEST_META_APP_ID,
    user_id: "meta_ext_user_123",
    scopes: ["ads_read", "ads_management", "business_management", "pages_show_list"],
    expires_at: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
  },
};

/** Queues the 4 fetch calls a successful callback makes, in order: code exchange, long-lived
 *  exchange, debug_token, /me. */
function queueSuccessfulMetaFlow(
  fetchMock: ReturnType<typeof vi.fn>,
  externalUserId = "meta_ext_user_123",
) {
  fetchMock
    .mockImplementationOnce(() => fetchOk({ access_token: "short-lived-token", expires_in: 5400 }))
    .mockImplementationOnce(() =>
      fetchOk({ access_token: REAL_META_ACCESS_TOKEN, expires_in: 5184000 }),
    )
    .mockImplementationOnce(() =>
      fetchOk({ data: { ...VALID_DEBUG_TOKEN_RESPONSE.data, user_id: externalUserId } }),
    )
    .mockImplementationOnce(() => fetchOk({ id: externalUserId }));
}

describe("Meta OAuth & connection lifecycle API (Phase 3.1)", () => {
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
    const logger = createLogger({ serviceName: "test-api-meta", level: "silent" });
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

  async function authHeaders(clerkUserId: string, orgId?: string) {
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId, ...(orgId ? { org_id: orgId } : {}) });
    return { authorization: "Bearer token" };
  }

  describe("POST /workspaces/:id/meta/connect", () => {
    it("OWNER initiates a connection and receives an authorizationUrl", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      const url = new URL(response.json().data.authorizationUrl);
      expect(url.hostname).toBe("www.facebook.com");
      expect(url.searchParams.get("client_id")).toBe(TEST_META_APP_ID);
      expect(url.searchParams.get("state")).toBeTruthy();
      // [token security] App Secret never appears in the returned authorization URL.
      expect(url.toString()).not.toContain(TEST_META_APP_SECRET);
    });

    it("no session returns 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${randomUUID()}/meta/connect`,
      });
      expect(response.statusCode).toBe(401);
    });

    it("[forged workspace ID] a non-member cannot initiate a connection", async () => {
      const attackerClerkUserId = testClerkUserId();
      const { workspace: victimWorkspace } = await seedWorkspaceWithOwner("Victim");

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${victimWorkspace.id}/meta/connect`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[forbidden role] a VIEWER (lacks meta_connection.connect) is rejected", async () => {
      const { workspace } = await seedWorkspaceWithOwner();
      const viewer = await addMember(workspace.id);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("returns 503 when Meta is not configured", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const unconfiguredEnv = loadApiEnv({
        ...process.env,
        CLERK_SECRET_KEY: TEST_SECRET_KEY,
        META_APP_ID: undefined,
        META_APP_SECRET: undefined,
        META_OAUTH_REDIRECT_URI: undefined,
        META_CREDENTIAL_ENCRYPTION_KEY: undefined,
      });
      const unconfiguredApp = await buildApp({
        env: unconfiguredEnv,
        logger: createLogger({ serviceName: "test-api-meta-unconfigured", level: "silent" }),
      });
      await unconfiguredApp.ready();

      const response = await unconfiguredApp.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("PROVIDER_UNAVAILABLE");
      await unconfiguredApp.close();
    });

    it("[duplicate] a second connect attempt while already connected returns 409", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      queueSuccessfulMetaFlow(fetchMock);
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });
      const state = new URL(connectInit.json().data.authorizationUrl).searchParams.get("state")!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });
  });

  describe("GET /workspaces/:id/meta/connections", () => {
    it("lists no connections for a freshly-created workspace", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/connections`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.connections).toEqual([]);
    });

    it("no session returns 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${randomUUID()}/meta/connections`,
      });
      expect(response.statusCode).toBe(401);
    });

    it("a non-member cannot list another workspace's connections", async () => {
      const attackerClerkUserId = testClerkUserId();
      const { workspace: victimWorkspace } = await seedWorkspaceWithOwner("Victim");

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${victimWorkspace.id}/meta/connections`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[token security] a connected workspace's list response never includes credential fields", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      queueSuccessfulMetaFlow(fetchMock);
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });
      const state = new URL(connectInit.json().data.authorizationUrl).searchParams.get("state")!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const response = await app.inject({
        method: "GET",
        url: `/workspaces/${workspace.id}/meta/connections`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(REAL_META_ACCESS_TOKEN);
      expect(response.body.toLowerCase()).not.toContain("ciphertext");
      expect(response.body.toLowerCase()).not.toContain("authtag");
      const connection = response.json().data.connections[0];
      expect(Object.keys(connection).sort()).toEqual(
        [
          "createdAt",
          "disconnectedAt",
          "externalUserId",
          "id",
          "lastValidatedAt",
          "scopes",
          "status",
          "updatedAt",
        ].sort(),
      );
      expect(connection.status).toBe("CONNECTED");
    });
  });

  describe("GET /meta/oauth/callback", () => {
    async function initiate(workspaceId: string, clerkUserId: string) {
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceId}/meta/connect`,
        headers: await authHeaders(clerkUserId),
      });
      return new URL(response.json().data.authorizationUrl).searchParams.get("state")!;
    }

    it("[valid state] successful callback creates a connection and redirects to success — no Authorization header sent, matching a real browser's top-level redirect", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      queueSuccessfulMetaFlow(fetchMock);

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("status=success");
      const connection = await prisma.metaConnection.findUnique({
        where: { workspaceId: workspace.id },
      });
      expect(connection?.status).toBe("CONNECTED");
      expect(connection?.externalUserId).toBe("meta_ext_user_123");
    });

    it("[no requireAuth chain] an Authorization header — present, absent, or for a different user — never affects the outcome; only the state payload's bound identity does", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      const otherClerkUserId = testClerkUserId();
      queueSuccessfulMetaFlow(fetchMock);

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(otherClerkUserId),
      });

      expect(response.headers.location).toContain("status=success");
      const connection = await prisma.metaConnection.findUnique({
        where: { workspaceId: workspace.id },
      });
      expect(connection?.status).toBe("CONNECTED");
    });

    it("[missing state] rejected without calling Meta", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?code=real-code`,
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("status=error");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("[missing code] rejected without calling Meta", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${randomUUID()}`,
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("status=error");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("[invalid state] an unknown state token is rejected", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${randomUUID()}&code=real-code`,
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("reason=invalid_state");
    });

    it("[replayed state] a state token can only be consumed once", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      queueSuccessfulMetaFlow(fetchMock);

      const first = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });
      expect(first.headers.location).toContain("status=success");

      const replay = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });
      expect(replay.headers.location).toContain("reason=invalid_state");
    });

    it("[expired state] a state token past its TTL is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      // Simulate expiry by deleting the Redis key directly rather than waiting 10 minutes.
      const redis = getRedisConnection(process.env["REDIS_URL"] ?? "redis://localhost:6380");
      await redis.del(`meta:oauth:state:${state}`);

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });
      expect(response.headers.location).toContain("reason=invalid_state");
    });

    it("[wrong workspace] a membership removed between initiation and callback is rejected", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const admin = await addMember(workspace.id, "ADMIN", owner.userId);
      const state = await initiate(workspace.id, admin.clerkUserId);

      // Remove the membership before completing the callback.
      await prisma.workspaceMembership.update({
        where: { id: admin.membership.id },
        data: { status: "REMOVED" },
      });

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.headers.location).toContain("reason=wrong_workspace");
    });

    it("[canceled OAuth] Meta's own error/denial query param is handled without calling Meta", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?error=access_denied&error_reason=user_denied`,
      });
      expect(response.headers.location).toContain("reason=oauth_cancelled");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("[token exchange failure] a Meta 400 on code exchange is rejected, no connection created", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock.mockImplementationOnce(() =>
        fetchOk({ error: { message: "Invalid verification code format.", code: 100 } }, 400),
      );

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=invalid-code`,
      });

      expect(response.headers.location).toContain("reason=token_exchange_failed");
      const connection = await prisma.metaConnection.findUnique({
        where: { workspaceId: workspace.id },
      });
      expect(connection).toBeNull();
    });

    it("[token validation failure] debug_token reporting is_valid:false is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock
        .mockImplementationOnce(() => fetchOk({ access_token: "short-lived", expires_in: 5400 }))
        .mockImplementationOnce(() =>
          fetchOk({ access_token: REAL_META_ACCESS_TOKEN, expires_in: 5184000 }),
        )
        .mockImplementationOnce(() => fetchOk({ data: { is_valid: false } }));

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.headers.location).toContain("reason=token_validation_failed");
    });

    it("[insufficient permission] debug_token missing a required scope is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock
        .mockImplementationOnce(() => fetchOk({ access_token: "short-lived", expires_in: 5400 }))
        .mockImplementationOnce(() =>
          fetchOk({ access_token: REAL_META_ACCESS_TOKEN, expires_in: 5184000 }),
        )
        .mockImplementationOnce(() =>
          fetchOk({
            data: { is_valid: true, app_id: TEST_META_APP_ID, scopes: ["ads_read"] },
          }),
        );

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.headers.location).toContain("reason=insufficient_permission");
    });

    it("[provider 5xx] a Meta server error during token exchange is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock.mockImplementationOnce(() =>
        fetchOk({ error: { message: "Service unavailable" } }, 503),
      );

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.headers.location).toContain("reason=token_exchange_failed");
    });

    it("[rate limit] a Meta 429 during token exchange is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock.mockImplementationOnce(() =>
        fetchOk({ error: { message: "Too many calls", code: 17 } }, 429),
      );

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.headers.location).toContain("reason=token_exchange_failed");
    });

    it("[timeout] a network-level fetch rejection is handled without crashing", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error("fetch failed: ETIMEDOUT")));

      const response = await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("status=error");
    });

    it("[token security] no audit event ever stores the raw access token", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const state = await initiate(workspace.id, ownerClerkUserId);
      queueSuccessfulMetaFlow(fetchMock);

      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
      });

      const events = await prisma.auditEvent.findMany({ where: { workspaceId: workspace.id } });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(JSON.stringify(event.metadata)).not.toContain(REAL_META_ACCESS_TOKEN);
      }
    });
  });

  describe("POST /workspaces/:id/meta/connections/:connectionId/reconnect", () => {
    it("[no existing connection] returns 404", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connections/${randomUUID()}/reconnect`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(404);
    });

    it("reconnecting an existing connection increments connectionVersion", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      queueSuccessfulMetaFlow(fetchMock);
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connect`,
        headers: await authHeaders(ownerClerkUserId),
      });
      const firstState = new URL(connectInit.json().data.authorizationUrl).searchParams.get(
        "state",
      )!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${firstState}&code=real-code`,
        headers: await authHeaders(ownerClerkUserId),
      });
      const original = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspace.id },
      });

      const reconnectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/meta/connections/${original.id}/reconnect`,
        headers: await authHeaders(ownerClerkUserId),
      });
      expect(reconnectInit.statusCode).toBe(200);
      const reconnectState = new URL(reconnectInit.json().data.authorizationUrl).searchParams.get(
        "state",
      )!;
      queueSuccessfulMetaFlow(fetchMock);
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${reconnectState}&code=real-code-2`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const updated = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspace.id },
      });
      expect(updated.id).toBe(original.id); // same row, not a new one (OD-3A-04)
      expect(updated.connectionVersion).toBe(original.connectionVersion + 1);
    });

    it("[cross-workspace] a connectionId from workspace B cannot be reconnected via workspace A's path", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB, ownerClerkUserId: ownerB } = await seedWorkspaceWithOwner("B");
      queueSuccessfulMetaFlow(fetchMock, "meta_ext_user_B");
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceB.id}/meta/connect`,
        headers: await authHeaders(ownerB),
      });
      const state = new URL(connectInit.json().data.authorizationUrl).searchParams.get("state")!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(ownerB),
      });
      const connectionB = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspaceB.id },
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceA.id}/meta/connections/${connectionB.id}/reconnect`,
        headers: await authHeaders(ownerA),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /workspaces/:id/meta/connections/:connectionId", () => {
    async function connectWorkspace(
      workspaceId: string,
      clerkUserId: string,
      externalUserId = "meta_ext_user_x",
    ) {
      queueSuccessfulMetaFlow(fetchMock, externalUserId);
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceId}/meta/connect`,
        headers: await authHeaders(clerkUserId),
      });
      const state = new URL(connectInit.json().data.authorizationUrl).searchParams.get("state")!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(clerkUserId),
      });
      return prisma.metaConnection.findUniqueOrThrow({ where: { workspaceId } });
    }

    it("OWNER disconnects successfully — credential material is deleted", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const connection = await connectWorkspace(workspace.id, ownerClerkUserId);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/meta/connections/${connection.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.connection.status).toBe("DISCONNECTED");
      const row = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspace.id },
      });
      expect(row.credentialCiphertext).toBeNull();
      expect(row.credentialIv).toBeNull();
      expect(row.credentialAuthTag).toBeNull();
    });

    it("[already disconnected] disconnecting twice returns 409 the second time", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const connection = await connectWorkspace(workspace.id, ownerClerkUserId);
      await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/meta/connections/${connection.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/meta/connections/${connection.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(409);
    });

    it("[no connection] returns 404", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/meta/connections/${randomUUID()}`,
        headers: await authHeaders(ownerClerkUserId),
      });
      expect(response.statusCode).toBe(404);
    });

    it("[forbidden role] a VIEWER (lacks meta_connection.disconnect) is rejected", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const connection = await connectWorkspace(workspace.id, ownerClerkUserId);
      const viewer = await addMember(workspace.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/meta/connections/${connection.id}`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[cross-workspace] workspace A cannot disconnect workspace B's connection", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB, ownerClerkUserId: ownerB } = await seedWorkspaceWithOwner("B");
      const connectionB = await connectWorkspace(workspaceB.id, ownerB, "meta_ext_user_B2");

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspaceA.id}/meta/connections/${connectionB.id}`,
        headers: await authHeaders(ownerA),
      });

      expect(response.statusCode).toBe(404);
      const stillConnected = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspaceB.id },
      });
      expect(stillConnected.status).toBe("CONNECTED");
    });
  });

  describe("Tenant isolation (external Meta ID is never an authorization key)", () => {
    it("knowing another workspace's connection ID or external Meta user ID grants no access", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB, ownerClerkUserId: ownerB } = await seedWorkspaceWithOwner("B");
      queueSuccessfulMetaFlow(fetchMock, "meta_ext_user_isolation_test");
      const connectInit = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceB.id}/meta/connect`,
        headers: await authHeaders(ownerB),
      });
      const state = new URL(connectInit.json().data.authorizationUrl).searchParams.get("state")!;
      await app.inject({
        method: "GET",
        url: `/meta/oauth/callback?state=${state}&code=real-code`,
        headers: await authHeaders(ownerB),
      });
      const connectionB = await prisma.metaConnection.findUniqueOrThrow({
        where: { workspaceId: workspaceB.id },
      });

      // Workspace A's own connection list never shows B's connection, no matter what A's
      // owner knows about B's connection ID or external Meta user ID.
      const listResponse = await app.inject({
        method: "GET",
        url: `/workspaces/${workspaceA.id}/meta/connections`,
        headers: await authHeaders(ownerA),
      });
      expect(listResponse.json().data.connections).toEqual([]);
      expect(listResponse.body).not.toContain(connectionB.id);
      expect(listResponse.body).not.toContain("meta_ext_user_isolation_test");
    });
  });
});
