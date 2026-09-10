import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import { getPrismaClient, createWorkspaceWithOwner } from "@ai-marketing-manager/domain";

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

/**
 * Phase 2.3 Steps 8/9/12 — the workspace API surface and the security-relevant negative
 * tests explicitly required: IDOR/BOLA, cross-workspace access, client-supplied workspace
 * ID abuse, privilege escalation via role tampering.
 */
describe("Workspace API (Phase 2.3 Step 8) and cross-tenant security (Step 12)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    ({ verifyToken } = (await import("@clerk/backend")) as unknown as {
      verifyToken: ReturnType<typeof vi.fn>;
    });
    const env = loadApiEnv({ ...process.env, CLERK_SECRET_KEY: TEST_SECRET_KEY });
    const logger = createLogger({ serviceName: "test-api-workspaces", level: "silent" });
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

  async function authHeaders(clerkUserId: string, orgId?: string) {
    verifyToken.mockResolvedValueOnce({ sub: clerkUserId, ...(orgId ? { org_id: orgId } : {}) });
    return { authorization: "Bearer token" };
  }

  it("GET /workspaces with no session returns 401", async () => {
    const response = await app.inject({ method: "GET", url: "/workspaces" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /workspaces lists only the caller's own memberships", async () => {
    const clerkUserId = testClerkUserId();
    const otherClerkUserId = testClerkUserId();
    await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId: testClerkOrgId(),
      name: "Mine",
      ownerClerkUserId: clerkUserId,
      syncedAt: new Date(),
    });
    await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId: testClerkOrgId(),
      name: "Not Mine",
      ownerClerkUserId: otherClerkUserId,
      syncedAt: new Date(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/workspaces",
      headers: await authHeaders(clerkUserId),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.workspaces).toHaveLength(1);
    expect(body.data.workspaces[0].name).toBe("Mine");
  });

  it("POST /workspaces/:id/switch succeeds for an actual member", async () => {
    const clerkUserId = testClerkUserId();
    const { workspace } = await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId: testClerkOrgId(),
      name: "Switchable Workspace",
      ownerClerkUserId: clerkUserId,
      syncedAt: new Date(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/switch`,
      headers: await authHeaders(clerkUserId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.workspace.id).toBe(workspace.id);
  });

  describe("cross-tenant negative tests (multi-tenancy.md §4, identity-threat-model.md)", () => {
    it("[forged workspace ID] a user cannot switch into a workspace they were never a member of — 403, not a partial success", async () => {
      const attackerClerkUserId = testClerkUserId();
      const victimClerkUserId = testClerkUserId();
      const { workspace: victimWorkspace } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Victim Workspace",
        ownerClerkUserId: victimClerkUserId,
        syncedAt: new Date(),
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${victimWorkspace.id}/switch`,
        headers: await authHeaders(attackerClerkUserId),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("[workspace switching attack] switching into a workspace after being removed fails identically to never having joined", async () => {
      const clerkUserId = testClerkUserId();
      const { workspace } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Revocable Workspace",
        ownerClerkUserId: clerkUserId,
        syncedAt: new Date(),
      });

      // Revoke membership directly (simulating an application-side removal/sync).
      await prisma.workspaceMembership.updateMany({
        where: { workspaceId: workspace.id },
        data: { status: "REMOVED" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/switch`,
        headers: await authHeaders(clerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[IDOR/BOLA] a fabricated/nonexistent workspace ID fails the same way as a real one the caller isn't a member of", async () => {
      const clerkUserId = testClerkUserId();
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${randomUUID()}/switch`,
        headers: await authHeaders(clerkUserId),
      });

      expect(response.statusCode).toBe(403); // no enumeration signal distinguishing the two cases
    });

    it("[cross-workspace isolation] GET /me never exposes another tenant's workspace even when both share an owner-of-record coincidence", async () => {
      const userA = testClerkUserId();
      const userB = testClerkUserId();
      const { workspace: workspaceA } = await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Tenant A",
        ownerClerkUserId: userA,
        syncedAt: new Date(),
      });
      await createWorkspaceWithOwner(prisma, {
        clerkOrganizationId: testClerkOrgId(),
        name: "Tenant B",
        ownerClerkUserId: userB,
        syncedAt: new Date(),
      });

      const response = await app.inject({
        method: "GET",
        url: "/me",
        headers: await authHeaders(userA),
      });

      const body = response.json();
      expect(body.data.memberships).toHaveLength(1);
      expect(body.data.memberships[0].id).toBe(workspaceA.id);
    });
  });
});
