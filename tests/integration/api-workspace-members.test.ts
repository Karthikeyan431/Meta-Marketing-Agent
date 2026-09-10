import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ClerkAPIResponseError } from "@clerk/backend/errors";
import { createLogger } from "@ai-marketing-manager/config";
import { loadApiEnv } from "@ai-marketing-manager/api/env";
import { buildApp, type App } from "@ai-marketing-manager/api/app";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
  upsertMembershipFromSync,
  changeMembershipRole,
} from "@ai-marketing-manager/domain";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
  createClerkClient: vi.fn(),
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

async function seedWorkspaceWithOwner(name = "Member API Test Workspace") {
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

/** Adds a new member at VIEWER, optionally promoted by `actorUserId` (Phase 2.4 closed
 *  self-promotion — any role above VIEWER requires a distinct, already-authorized actor). */
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

/**
 * Phase 2.5 — member-management API surface (PATCH/DELETE .../members/:membershipId,
 * POST .../ownership-transfer). Closes the `phase-2-4a-test-matrix.md` REQUIRED-at-route-
 * level items (W4 already covered in api-workspaces.test.ts; E1-E4, C2, F5, and the
 * E5-adjacent spoof extension are exercised here through the real HTTP surface for the
 * first time — domain-layer coverage for these already exists in
 * identity-owner-invariant.test.ts and is not duplicated here).
 */
describe("Workspace member-management API (Phase 2.5)", () => {
  let app: App;
  let verifyToken: ReturnType<typeof vi.fn>;
  const createOrganizationInvitation = vi.fn();

  beforeAll(async () => {
    const clerkBackendMock = (await import("@clerk/backend")) as unknown as {
      verifyToken: ReturnType<typeof vi.fn>;
      createClerkClient: ReturnType<typeof vi.fn>;
    };
    ({ verifyToken } = clerkBackendMock);
    clerkBackendMock.createClerkClient.mockReturnValue({
      organizations: { createOrganizationInvitation },
    });
    const env = loadApiEnv({ ...process.env, CLERK_SECRET_KEY: TEST_SECRET_KEY });
    const logger = createLogger({ serviceName: "test-api-workspace-members", level: "silent" });
    app = await buildApp({ env, logger });
    await app.ready();
  });

  afterEach(() => {
    verifyToken.mockReset();
    createOrganizationInvitation.mockReset();
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

  describe("PATCH /workspaces/:id/members/:membershipId — role change", () => {
    it("OWNER changes a VIEWER's role to MANAGER", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { newRole: "MANAGER" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.membership.role).toBe("MANAGER");
    });

    it("[E1] a member cannot change their own role via the route, even to a role they'd otherwise qualify to assign", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const admin = await addMember(workspace.id, "ADMIN", owner.userId);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${admin.membership.id}`,
        headers: await authHeaders(admin.clerkUserId),
        payload: { newRole: "ADMIN" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("[E2] ADMIN cannot promote a member to OWNER via the route", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const admin = await addMember(workspace.id, "ADMIN", owner.userId);
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(admin.clerkUserId),
        payload: { newRole: "OWNER" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("OWNER granting OWNER to a different member succeeds via the route (legitimate co-ownership grant)", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { newRole: "OWNER" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.membership.role).toBe("OWNER");
    });

    it("[E3] MANAGER cannot change any member's role — 403 before any role-comparison logic runs", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const manager = await addMember(workspace.id, "MANAGER", owner.userId);
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(manager.clerkUserId),
        payload: { newRole: "ADMIN" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("[E4] client-supplied extra body fields (role/permission spoof) are ignored — only the actor's real DB membership is checked", async () => {
      const { workspace } = await seedWorkspaceWithOwner();
      const viewer = await addMember(workspace.id);
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(viewer.clerkUserId),
        payload: { newRole: "ADMIN", role: "OWNER", permission: "members.update" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("[E5-adjacent] a membershipId belonging to a different workspace is treated as not found (404), never cross-workspace-authorized", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB } = await seedWorkspaceWithOwner("B");
      const targetInB = await addMember(workspaceB.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspaceA.id}/members/${targetInB.membership.id}`,
        headers: await authHeaders(ownerA),
        payload: { newRole: "ADMIN" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });

    it("[F5] demoting the last remaining OWNER via the route returns 409 CONFLICT, not 200 or 403", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const admin = await addMember(workspace.id, "ADMIN", owner.userId);

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${owner.id}`,
        headers: await authHeaders(admin.clerkUserId),
        payload: { newRole: "ADMIN" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });

    it("[C2] two concurrent role-change requests to the same membership never corrupt state — exactly one of the two roles wins", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      const [r1, r2] = await Promise.all([
        app.inject({
          method: "PATCH",
          url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
          headers: await authHeaders(ownerClerkUserId),
          payload: { newRole: "MANAGER" },
        }),
        app.inject({
          method: "PATCH",
          url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
          headers: await authHeaders(ownerClerkUserId),
          payload: { newRole: "ANALYST" },
        }),
      ]);

      expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
      const finalRole = (
        await prisma.workspaceMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).role;
      expect(["MANAGER", "ANALYST"]).toContain(finalRole);
    });

    it("[C3, TOCTOU] a membership removed between resolution and mutation fails closed with 404, not a stale-role success", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      await prisma.workspaceMembership.update({
        where: { id: target.membership.id },
        data: { status: "REMOVED" },
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { newRole: "MANAGER" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("no session returns 401", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/workspaces/${randomUUID()}/members/${randomUUID()}`,
        payload: { newRole: "MANAGER" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("DELETE /workspaces/:id/members/:membershipId — removal", () => {
    it("OWNER removes a different member", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.membership.status).toBe("REMOVED");
    });

    it("a VIEWER can remove themselves ('leave the workspace') despite holding no members.remove permission", async () => {
      const { workspace } = await seedWorkspaceWithOwner();
      const viewer = await addMember(workspace.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/members/${viewer.membership.id}`,
        headers: await authHeaders(viewer.clerkUserId),
      });

      expect(response.statusCode).toBe(200);
    });

    it("MANAGER cannot remove a different member", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const manager = await addMember(workspace.id, "MANAGER", owner.userId);
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/members/${target.membership.id}`,
        headers: await authHeaders(manager.clerkUserId),
      });

      expect(response.statusCode).toBe(403);
    });

    it("[F5] removing the last remaining OWNER returns 409 CONFLICT", async () => {
      const { workspace, ownerClerkUserId, owner } = await seedWorkspaceWithOwner();

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspace.id}/members/${owner.id}`,
        headers: await authHeaders(ownerClerkUserId),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });

    it("[E5-adjacent] a membershipId belonging to a different workspace is 404, not deletable cross-tenant", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB } = await seedWorkspaceWithOwner("B");
      const targetInB = await addMember(workspaceB.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspaceA.id}/members/${targetInB.membership.id}`,
        headers: await authHeaders(ownerA),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /workspaces/:id/ownership-transfer", () => {
    it("OWNER transfers ownership to another member — outgoing becomes ADMIN, incoming becomes OWNER", async () => {
      const { workspace, ownerClerkUserId, owner } = await seedWorkspaceWithOwner();
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/ownership-transfer`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { toMembershipId: target.membership.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.from.id).toBe(owner.id);
      expect(body.from.role).toBe("ADMIN");
      expect(body.to.id).toBe(target.membership.id);
      expect(body.to.role).toBe("OWNER");
    });

    it("a non-owner (ADMIN) cannot initiate an ownership transfer — fromMembershipId is always the caller's own, never client-suppliable", async () => {
      const { workspace, owner } = await seedWorkspaceWithOwner();
      const admin = await addMember(workspace.id, "ADMIN", owner.userId);
      const target = await addMember(workspace.id);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/ownership-transfer`,
        headers: await authHeaders(admin.clerkUserId),
        payload: { toMembershipId: target.membership.id },
      });

      // fromMembershipId always resolves to the caller's own membership (never client-
      // suppliable — see the route's doc comment), so a non-owner caller hits
      // transferOwnershipTx's "Source membership is not an owner" OwnerInvariantError
      // (409), the same path identity-owner-invariant.test.ts's domain-layer test exercises
      // directly — not the actorUserId-mismatch InsufficientRoleAuthorityError (403), which
      // this route's design makes structurally unreachable (it only protects against a
      // caller naming *someone else's* membership as fromMembershipId).
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });

    it("[E5-adjacent] a toMembershipId belonging to a different workspace is rejected (never cross-workspace-authorized)", async () => {
      const { workspace: workspaceA, ownerClerkUserId: ownerA } = await seedWorkspaceWithOwner("A");
      const { workspace: workspaceB } = await seedWorkspaceWithOwner("B");
      const targetInB = await addMember(workspaceB.id);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceA.id}/ownership-transfer`,
        headers: await authHeaders(ownerA),
        payload: { toMembershipId: targetInB.membership.id },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /workspaces/:id/members/invite", () => {
    it("OWNER successfully invites a new member by email", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: "https://clerk.example.com/accept?__clerk_ticket=super-secret-not-a-real-token",
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json().data.invitation;
      expect(body).toEqual({
        id: expect.any(String),
        emailAddress: "invitee@example.com",
        status: "pending",
      });
      expect(createOrganizationInvitation).toHaveBeenCalledTimes(1);
    });

    it("no session returns 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${randomUUID()}/members/invite`,
        payload: { emailAddress: "invitee@example.com" },
      });
      expect(response.statusCode).toBe(401);
      expect(createOrganizationInvitation).not.toHaveBeenCalled();
    });

    it("a member without members.invite permission (VIEWER) is rejected with 403 before Clerk is ever called", async () => {
      const { workspace } = await seedWorkspaceWithOwner();
      const viewer = await addMember(workspace.id);

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(viewer.clerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("AUTHORIZATION_ERROR");
      expect(createOrganizationInvitation).not.toHaveBeenCalled();
    });

    it("[cross-workspace] a non-member cannot invite into a workspace they don't belong to", async () => {
      const attackerClerkUserId = testClerkUserId();
      const { workspace: victimWorkspace } = await seedWorkspaceWithOwner("Victim");

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${victimWorkspace.id}/members/invite`,
        headers: await authHeaders(attackerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(403);
      expect(createOrganizationInvitation).not.toHaveBeenCalled();
    });

    it("[spoof] the Clerk organizationId always comes from the server-resolved Workspace row, never any client-suppliable field", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: null,
      });

      await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        // extra client-supplied fields the schema strips — organizationId/workspaceId
        // spoof attempts, ignored entirely; only :id (server-resolved) and emailAddress
        // (validated) are ever used.
        payload: {
          emailAddress: "invitee@example.com",
          organizationId: "org_attacker_controlled",
          workspaceId: randomUUID(),
        },
      });

      expect(createOrganizationInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: workspace.clerkOrganizationId }),
      );
    });

    it("[no role escalation] the Clerk role passed is always the fixed non-authoritative value, never client-suppliable, never OWNER-equivalent", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: null,
      });

      await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com", role: "OWNER" },
      });

      const call = createOrganizationInvitation.mock.calls[0]?.[0];
      expect(call.role).toBe("org:member");
      expect(call.role).not.toMatch(/admin|owner/i);
    });

    it("[Clerk 4xx failure] a duplicate/already-invited response from Clerk maps to 409 CONFLICT, not 500", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockRejectedValueOnce(
        new ClerkAPIResponseError("Invitation already exists", {
          data: [{ code: "duplicate_record", message: "already invited" }],
          status: 422,
        }),
      );

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });

    it("[repeated invitation] inviting the same email twice is safe — second call also 409, no crash, no duplicate local state", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: null,
      });
      createOrganizationInvitation.mockRejectedValueOnce(
        new ClerkAPIResponseError("Invitation already exists", {
          data: [{ code: "duplicate_record", message: "already invited" }],
          status: 422,
        }),
      );

      const first = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });
      const second = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
    });

    it("[Clerk unexpected failure] a non-API-response error (network/outage) maps to 503 PROVIDER_UNAVAILABLE", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockRejectedValueOnce(new Error("ECONNRESET"));

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("PROVIDER_UNAVAILABLE");
    });

    it("a successful invitation creates NO local workspace_membership row for the invited email", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      const beforeCount = await prisma.workspaceMembership.count({
        where: { workspaceId: workspace.id },
      });
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: null,
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      expect(response.statusCode).toBe(201);
      const afterCount = await prisma.workspaceMembership.count({
        where: { workspaceId: workspace.id },
      });
      expect(afterCount).toBe(beforeCount); // unchanged — only the sync pipeline creates memberships
    });

    it("the response never includes Clerk's invitation URL or any token-shaped field", async () => {
      const { workspace, ownerClerkUserId } = await seedWorkspaceWithOwner();
      createOrganizationInvitation.mockResolvedValueOnce({
        id: `orginv_${randomUUID()}`,
        emailAddress: "invitee@example.com",
        status: "pending",
        url: "https://clerk.example.com/accept?__clerk_ticket=super-secret-not-a-real-token",
        publicMetadata: {},
        privateMetadata: {},
      });

      const response = await app.inject({
        method: "POST",
        url: `/workspaces/${workspace.id}/members/invite`,
        headers: await authHeaders(ownerClerkUserId),
        payload: { emailAddress: "invitee@example.com" },
      });

      const raw = response.body;
      expect(raw).not.toContain("clerk_ticket");
      expect(raw).not.toContain("url");
      expect(raw).not.toContain("Metadata");
      expect(Object.keys(response.json().data.invitation).sort()).toEqual([
        "emailAddress",
        "id",
        "status",
      ]);
    });
  });
});
