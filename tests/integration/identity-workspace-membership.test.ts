import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  syncWorkspaceProfile,
  provisionUser,
  upsertMembershipFromSync,
  findMembership,
  removeMembership,
  MembershipNotFoundError,
  isUniqueConstraintViolation,
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

describe("Clerk Organization → Workspace mapping (Phase 2.3 Step 4)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  it("creates a workspace with the creating user as OWNER, atomically", async () => {
    const clerkOrganizationId = testClerkOrgId();
    const ownerClerkUserId = testClerkUserId();

    const { workspace, ownerMembership, created } = await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId,
      name: "Test Workspace",
      ownerClerkUserId,
      syncedAt: new Date(),
    });

    expect(created).toBe(true);
    expect(workspace.clerkOrganizationId).toBe(clerkOrganizationId);
    expect(workspace.status).toBe("ACTIVE");
    expect(ownerMembership?.role).toBe("OWNER");
    expect(ownerMembership?.status).toBe("ACTIVE");

    const owner = await prisma.user.findUnique({ where: { clerkUserId: ownerClerkUserId } });
    expect(ownerMembership?.userId).toBe(owner?.id);
  });

  it("a duplicate organization mapping is rejected — idempotent, never a second workspace row", async () => {
    const clerkOrganizationId = testClerkOrgId();
    const ownerClerkUserId = testClerkUserId();

    const first = await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId,
      name: "Original Name",
      ownerClerkUserId,
      syncedAt: new Date(),
    });
    const second = await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId,
      name: "Attempted Duplicate",
      ownerClerkUserId: testClerkUserId(), // even a different "owner" cannot create a second workspace
      syncedAt: new Date(),
    });

    expect(second.created).toBe(false);
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.workspace.name).toBe("Original Name"); // unchanged by the rejected duplicate

    const rowCount = await prisma.workspace.count({ where: { clerkOrganizationId } });
    expect(rowCount).toBe(1);
  });

  it("concurrent organization-creation events for the same org cannot create duplicate workspaces", async () => {
    const clerkOrganizationId = testClerkOrgId();
    const ownerClerkUserId = testClerkUserId();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createWorkspaceWithOwner(prisma, {
          clerkOrganizationId,
          name: "Race Workspace",
          ownerClerkUserId,
          syncedAt: new Date(),
        }),
      ),
    );

    const uniqueWorkspaceIds = new Set(results.map((r) => r.workspace.id));
    expect(uniqueWorkspaceIds.size).toBe(1);
    expect(results.filter((r) => r.created).length).toBe(1);

    const rowCount = await prisma.workspace.count({ where: { clerkOrganizationId } });
    expect(rowCount).toBe(1);
  });

  it("repeated organization synchronization is idempotent and never overwrites application-owned fields", async () => {
    const clerkOrganizationId = testClerkOrgId();
    const ownerClerkUserId = testClerkUserId();
    await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId,
      name: "Name v1",
      ownerClerkUserId,
      syncedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const updated = await syncWorkspaceProfile(prisma, {
      clerkOrganizationId,
      name: "Name v2",
      syncedAt: new Date("2026-01-02T00:00:00Z"),
    });
    expect(updated?.name).toBe("Name v2");
    expect(updated?.status).toBe("ACTIVE"); // status is application-owned, never touched by this sync

    // A stale (older) event is a no-op.
    const afterStale = await syncWorkspaceProfile(prisma, {
      clerkOrganizationId,
      name: "Stale Name",
      syncedAt: new Date("2025-06-01T00:00:00Z"),
    });
    expect(afterStale?.name).toBe("Name v2");
  });
});

describe("Workspace membership (Phase 2.3 Step 2/5)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  async function seedWorkspaceWithOwner() {
    const clerkOrganizationId = testClerkOrgId();
    const ownerClerkUserId = testClerkUserId();
    const { workspace, ownerMembership } = await createWorkspaceWithOwner(prisma, {
      clerkOrganizationId,
      name: "Membership Test Workspace",
      ownerClerkUserId,
      syncedAt: new Date(),
    });
    return { workspace, ownerMembership: ownerMembership! };
  }

  it("valid membership creation via sync defaults to VIEWER, never taking role from Clerk", async () => {
    const { workspace } = await seedWorkspaceWithOwner();
    const memberClerkUserId = testClerkUserId();
    const member = await provisionUser(prisma, { clerkUserId: memberClerkUserId });

    const membership = await upsertMembershipFromSync(prisma, {
      workspaceId: workspace.id,
      userId: member.id,
      syncedAt: new Date(),
    });

    expect(membership.role).toBe("VIEWER");
    expect(membership.status).toBe("ACTIVE");
  });

  it("duplicate membership (same workspace + user) is rejected at the database level", async () => {
    const { workspace, ownerMembership } = await seedWorkspaceWithOwner();

    await expect(
      prisma.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: ownerMembership.userId, role: "VIEWER" },
      }),
    ).rejects.toSatisfy((error: unknown) => isUniqueConstraintViolation(error));
  });

  it("membership removal marks the row REMOVED, not a hard delete", async () => {
    const { workspace } = await seedWorkspaceWithOwner();
    const memberClerkUserId = testClerkUserId();
    const member = await provisionUser(prisma, { clerkUserId: memberClerkUserId });
    const membership = await upsertMembershipFromSync(prisma, {
      workspaceId: workspace.id,
      userId: member.id,
      syncedAt: new Date(),
    });

    // A second owner must exist first, or removal would violate the owner invariant —
    // this membership is a VIEWER, so no such conflict applies here.
    const removed = await removeMembership(prisma, {
      membershipId: membership.id,
      workspaceId: workspace.id,
      actorUserId: member.id,
    });

    expect(removed.status).toBe("REMOVED");
    expect(removed.removedAt).not.toBeNull();

    const stillExists = await prisma.workspaceMembership.findUnique({
      where: { id: membership.id },
    });
    expect(stillExists).not.toBeNull(); // never hard-deleted
  });

  it("cross-workspace membership isolation: a membership cannot be mutated by claiming the wrong workspace ID", async () => {
    const { workspace: workspaceA } = await seedWorkspaceWithOwner();
    const { workspace: workspaceB, ownerMembership: ownerB } = await seedWorkspaceWithOwner();

    // ownerB's membership belongs to workspaceB — attempting to remove it while claiming
    // workspaceA must fail exactly like a nonexistent membership (no cross-tenant leak).
    await expect(
      removeMembership(prisma, {
        membershipId: ownerB.id,
        workspaceId: workspaceA.id,
        actorUserId: ownerB.userId,
      }),
    ).rejects.toBeInstanceOf(MembershipNotFoundError);

    // The membership is untouched.
    const unaffected = await findMembership(prisma, {
      userId: ownerB.userId,
      workspaceId: workspaceB.id,
    });
    expect(unaffected?.status).toBe("ACTIVE");
    expect(unaffected?.role).toBe("OWNER");
  });
});
