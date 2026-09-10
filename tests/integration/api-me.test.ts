import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
} from "@ai-marketing-manager/domain";

/**
 * @clerk/backend's verifyToken is mocked throughout — no real Clerk application or
 * network call is ever involved. This satisfies the governing task's explicit instruction
 * to use mocks/fixtures in CI rather than depend on a real production Clerk account.
 */
vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

const TEST_SECRET_KEY = "test-fixture-secret-not-a-real-clerk-key";
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

describe("API authentication + identity boundary (Phase 2.2 + 2.3)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    ({ verifyToken } = (await import("@clerk/backend")) as unknown as {
      verifyToken: ReturnType<typeof vi.fn>;
    });

    const env = loadApiEnv({ ...process.env, CLERK_SECRET_KEY: TEST_SECRET_KEY });
    const logger = createLogger({ serviceName: "test-api-auth", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  afterEach(() => {
    verifyToken.mockReset();
  });

  afterAll(async () => {
    await app.close();
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  it("GET /me with no Authorization header returns 401 AUTHENTICATION_ERROR", async () => {
    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
    expect(body.error.requestId).toBeTruthy();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("GET /me with an invalid/expired token returns 401, never a guessed identity", async () => {
    verifyToken.mockRejectedValueOnce(new Error("token expired"));

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("GET /me with a valid token provisions and resolves the application user", async () => {
    const clerkUserId = testClerkUserId();
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer a-validly-signed-test-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.userId).toBe(clerkUserId);
    expect(body.data.user.id).toBeTruthy();
    expect(body.data.memberships).toEqual([]);
    expect(body.data.activeWorkspace).toBeNull();

    const applicationUser = await prisma.user.findUnique({ where: { clerkUserId } });
    expect(applicationUser).not.toBeNull();
    expect(applicationUser?.id).toBe(body.data.user.id);
  });

  it("a client cannot spoof another user's identity via headers/body — only the verified token's subject is ever returned", async () => {
    const clerkUserId = testClerkUserId();
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: "Bearer a-validly-signed-test-token",
        // A malicious/confused client claiming to be someone else — must be ignored.
        "x-user-id": "user_attacker",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.userId).toBe(clerkUserId);
  });

  it("never leaks the configured secret key value in a response body", async () => {
    const clerkUserId = testClerkUserId();
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId });

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer a-validly-signed-test-token" },
    });

    expect(response.payload).not.toContain(TEST_SECRET_KEY);
  });

  it("never leaks the configured secret key value in a 401 error response", async () => {
    const response = await app.inject({ method: "GET", url: "/me" });
    expect(response.payload).not.toContain(TEST_SECRET_KEY);
  });

  describe("active workspace resolution (workspace-model.md §3)", () => {
    it("resolves the sole membership as the active workspace when no org is claimed", async () => {
      const clerkUserId = testClerkUserId();
      const clerkOrgId = testClerkOrgId();
      const { workspace } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: clerkOrgId,
        name: "Solo Membership Workspace",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });

      verifyToken.mockResolvedValueOnce({ sub: clerkUserId }); // no org_id claim

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer token" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.memberships).toHaveLength(1);
      expect(body.data.activeWorkspace?.id).toBe(workspace.id);
      expect(body.data.activeWorkspace?.role).toBe("OWNER");
    });

    it("resolves the claimed org_id workspace when the user belongs to more than one", async () => {
      const clerkUserId = testClerkUserId();
      const primaryOrgId = testClerkOrgId();
      const secondaryOrgId = testClerkOrgId();

      const { workspace: primaryWorkspace } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: primaryOrgId,
        name: "Primary Workspace",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });
      await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: secondaryOrgId,
        name: "Secondary Workspace",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });

      verifyToken.mockResolvedValueOnce({ sub: clerkUserId, org_id: primaryOrgId });

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer token" },
      });

      const body = response.json();
      expect(body.data.memberships).toHaveLength(2);
      expect(body.data.activeWorkspace?.id).toBe(primaryWorkspace.id);
    });

    it("does not guess when the user has multiple memberships and no org is claimed", async () => {
      const clerkUserId = testClerkUserId();
      await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Ambiguous Workspace A",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });
      await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Ambiguous Workspace B",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });

      verifyToken.mockResolvedValueOnce({ sub: clerkUserId });

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer token" },
      });

      const body = response.json();
      expect(body.data.memberships).toHaveLength(2);
      expect(body.data.activeWorkspace).toBeNull(); // server never guesses
    });

    it("resolves to no active workspace when the claimed org has no local membership (not yet synced)", async () => {
      const clerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId });
      const unsyncedOrgId = testClerkOrgId(); // deliberately never mapped to a workspace

      verifyToken.mockResolvedValueOnce({ sub: clerkUserId, org_id: unsyncedOrgId });

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer token" },
      });

      const body = response.json();
      expect(body.data.activeWorkspace).toBeNull();
    });

    it("supports the versioned (v:2) token shape's nested org claim", async () => {
      const clerkUserId = testClerkUserId();
      const clerkOrgId = testClerkOrgId();
      const { workspace } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: clerkOrgId,
        name: "V2 Claim Workspace",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });

      verifyToken.mockResolvedValueOnce({ sub: clerkUserId, v: 2, o: { id: clerkOrgId } });

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer token" },
      });

      expect(response.json().data.activeWorkspace?.id).toBe(workspace.id);
    });
  });
});
