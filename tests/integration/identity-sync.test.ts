import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getPrismaClient,
  provisionUser,
  findUserByClerkId,
  syncOrganizationCreated,
  syncOrganizationUpdated,
  syncOrganizationDeleted,
  syncMembershipUpsert,
  syncMembershipRemoved,
  changeMembershipRole,
  DeferredSyncError,
} from "@ai-marketing-manager/domain";

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

describe("Clerk webhook/reconciliation sync handlers (identity-sync.md)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  describe("organization.created", () => {
    it("with a created_by, creates the workspace and its owner", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();

      const result = await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Synced Org",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      expect(result.created).toBe(true);
      expect(result.ownerMembership?.role).toBe("OWNER");
    });

    it("without a created_by, defers rather than creating an ownerless workspace", async () => {
      const clerkOrganizationId = testClerkOrgId();

      await expect(
        syncOrganizationCreated(prisma, {
          clerkOrganizationId,
          name: "No Creator Org",
          createdByClerkUserId: null,
          updatedAt: new Date(),
        }),
      ).rejects.toBeInstanceOf(DeferredSyncError);

      const workspace = await prisma.workspace.findUnique({ where: { clerkOrganizationId } });
      expect(workspace).toBeNull(); // never created without a resolvable owner
    });
  });

  describe("organization.updated / organization.deleted — out-of-order and missing-parent handling", () => {
    it("defers when the workspace doesn't exist locally yet (out-of-order delivery)", async () => {
      const clerkOrganizationId = testClerkOrgId();

      await expect(
        syncOrganizationUpdated(prisma, {
          clerkOrganizationId,
          name: "Ghost Update",
          createdByClerkUserId: null,
          updatedAt: new Date(),
        }),
      ).rejects.toBeInstanceOf(DeferredSyncError);
    });

    it("organization.deleted marks the workspace inactive, never hard-deletes", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();
      await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Doomed Org",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      const deleted = await syncOrganizationDeleted(prisma, { clerkOrganizationId });
      expect(deleted?.status).toBe("DELETED");

      const stillExists = await prisma.workspace.findUnique({ where: { clerkOrganizationId } });
      expect(stillExists).not.toBeNull();
    });
  });

  describe("organizationMembership.created/.updated — role never taken from Clerk", () => {
    it("defers when the workspace parent doesn't exist locally yet", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const clerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId });

      await expect(
        syncMembershipUpsert(prisma, { clerkOrganizationId, clerkUserId, updatedAt: new Date() }),
      ).rejects.toBeInstanceOf(DeferredSyncError);
    });

    it("defers when the user parent doesn't exist locally yet", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();
      await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Org Without Member Yet",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      const unknownClerkUserId = testClerkUserId();
      // Deliberately never provisioned — simulates a user.created webhook that hasn't
      // arrived yet.
      await expect(
        syncMembershipUpsert(prisma, {
          clerkOrganizationId,
          clerkUserId: unknownClerkUserId,
          updatedAt: new Date(),
        }),
      ).rejects.toBeInstanceOf(DeferredSyncError);
    });

    it("an existing membership's role is never overwritten by a subsequent sync event", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();
      const { workspace } = await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Role Stability Org",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      const memberClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: memberClerkUserId });
      const membership = await syncMembershipUpsert(prisma, {
        clerkOrganizationId,
        clerkUserId: memberClerkUserId,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });
      expect(membership.role).toBe("VIEWER");

      // Promote the member locally (application-initiated) — the workspace owner acts,
      // never the member promoting themselves (rbac.md §8.2 rule 2).
      const owner = await findUserByClerkId(prisma, ownerClerkUserId);
      await changeMembershipRole(prisma, {
        membershipId: membership.id,
        workspaceId: workspace.id,
        newRole: "MANAGER",
        actorUserId: owner!.id,
      });

      // A subsequent Clerk membership.updated event must not revert the role.
      const afterSync = await syncMembershipUpsert(prisma, {
        clerkOrganizationId,
        clerkUserId: memberClerkUserId,
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      });
      expect(afterSync.role).toBe("MANAGER");
    });
  });

  describe("organizationMembership.deleted — never silently orphans a workspace", () => {
    it("removes a non-owner membership without any special audit signal", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();
      await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Normal Removal Org",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      const memberClerkUserId = testClerkUserId();
      await provisionUser(prisma, { clerkUserId: memberClerkUserId });
      await syncMembershipUpsert(prisma, {
        clerkOrganizationId,
        clerkUserId: memberClerkUserId,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const removed = await syncMembershipRemoved(prisma, {
        clerkOrganizationId,
        clerkUserId: memberClerkUserId,
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      });
      expect(removed?.status).toBe("REMOVED");
    });

    it("removing the last owner via external Clerk sync still applies, but writes a loud FAILURE audit event", async () => {
      const clerkOrganizationId = testClerkOrgId();
      const ownerClerkUserId = testClerkUserId();
      const { workspace } = await syncOrganizationCreated(prisma, {
        clerkOrganizationId,
        name: "Orphan Risk Org",
        createdByClerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
      });

      const removed = await syncMembershipRemoved(prisma, {
        clerkOrganizationId,
        clerkUserId: ownerClerkUserId,
        updatedAt: new Date(),
        correlationId: "test-correlation-id",
      });
      expect(removed?.status).toBe("REMOVED");

      const remainingOwners = await prisma.workspaceMembership.count({
        where: { workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
      });
      expect(remainingOwners).toBe(0); // never silently prevented — Clerk is authoritative

      const auditRow = await prisma.auditEvent.findFirst({
        where: { workspaceId: workspace.id, eventType: "workspace.owner_invariant_violated" },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow?.outcome).toBe("FAILURE");
      expect(auditRow?.correlationId).toBe("test-correlation-id");
    });
  });
});
