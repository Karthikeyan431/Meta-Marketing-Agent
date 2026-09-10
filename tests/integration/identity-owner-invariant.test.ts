import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getPrismaClient,
  createWorkspaceWithOwner,
  provisionUser,
  upsertMembershipFromSync,
  changeMembershipRole,
  removeMembership,
  transferOwnership,
  findMembership,
  OwnerInvariantError,
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

async function seedWorkspaceWithOwner(name = "Owner Invariant Test Workspace") {
  const clerkOrganizationId = testClerkOrgId();
  const ownerClerkUserId = testClerkUserId();
  const { workspace, ownerMembership } = await createWorkspaceWithOwner(prisma, {
    clerkOrganizationId,
    name,
    ownerClerkUserId,
    syncedAt: new Date(),
  });
  return { workspace, owner: ownerMembership! };
}

async function addMember(
  workspaceId: string,
  role: "ADMIN" | "MANAGER" | "ANALYST" | "VIEWER" = "VIEWER",
) {
  const clerkUserId = testClerkUserId();
  const user = await provisionUser(prisma, { clerkUserId });
  const membership = await upsertMembershipFromSync(prisma, {
    workspaceId,
    userId: user.id,
    syncedAt: new Date(),
  });
  if (role !== "VIEWER") {
    return changeMembershipRole(prisma, {
      membershipId: membership.id,
      workspaceId,
      newRole: role,
      actorUserId: membership.userId,
    });
  }
  return membership;
}

describe("Owner invariant (Phase 2.3 Step 6, workspace-model.md §5, ADR-020)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  it("cannot remove the final owner of a workspace", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();

    await expect(
      removeMembership(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        actorUserId: owner.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerInvariantError);

    const stillActive = await findMembership(prisma, {
      userId: owner.userId,
      workspaceId: workspace.id,
    });
    expect(stillActive?.status).toBe("ACTIVE");
    expect(stillActive?.role).toBe("OWNER");
  });

  it("cannot demote the final owner away from OWNER via a direct role change", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();

    await expect(
      changeMembershipRole(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        newRole: "ADMIN",
        actorUserId: owner.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerInvariantError);
  });

  it("removing an owner succeeds once a second owner exists", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const secondOwner = await addMember(workspace.id, "ADMIN");
    await changeMembershipRole(prisma, {
      membershipId: secondOwner.id,
      workspaceId: workspace.id,
      newRole: "OWNER",
      actorUserId: owner.userId,
    });

    const removed = await removeMembership(prisma, {
      membershipId: owner.id,
      workspaceId: workspace.id,
      actorUserId: secondOwner.userId,
    });
    expect(removed.status).toBe("REMOVED");
  });

  it("a valid ownership transfer succeeds and leaves exactly one owner", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const incoming = await addMember(workspace.id, "ADMIN");

    const { from, to } = await transferOwnership(prisma, {
      workspaceId: workspace.id,
      fromMembershipId: owner.id,
      toMembershipId: incoming.id,
      actorUserId: owner.userId,
    });

    expect(from.role).toBe("ADMIN");
    expect(to.role).toBe("OWNER");

    const ownerCount = await prisma.workspaceMembership.count({
      where: { workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
    });
    expect(ownerCount).toBe(1);
  });

  it("transferring ownership from a non-owner membership is rejected", async () => {
    const { workspace } = await seedWorkspaceWithOwner();
    const memberA = await addMember(workspace.id, "ADMIN");
    const memberB = await addMember(workspace.id, "ADMIN");

    await expect(
      transferOwnership(prisma, {
        workspaceId: workspace.id,
        fromMembershipId: memberA.id, // not an OWNER
        toMembershipId: memberB.id,
        actorUserId: memberA.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerInvariantError);
  });

  it("the workspace never reaches zero owners under concurrent owner-removal attempts", async () => {
    const { workspace, owner: ownerA } = await seedWorkspaceWithOwner();
    const ownerB = await addMember(workspace.id, "ADMIN");
    await changeMembershipRole(prisma, {
      membershipId: ownerB.id,
      workspaceId: workspace.id,
      newRole: "OWNER",
      actorUserId: ownerA.userId,
    });

    // Two owners exist. Fire concurrent removal attempts for BOTH — removing either alone
    // is legal, but removing both would leave zero owners, so at most one may succeed.
    const results = await Promise.allSettled([
      removeMembership(prisma, {
        membershipId: ownerA.id,
        workspaceId: workspace.id,
        actorUserId: ownerA.userId,
      }),
      removeMembership(prisma, {
        membershipId: ownerB.id,
        workspaceId: workspace.id,
        actorUserId: ownerB.userId,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(OwnerInvariantError);

    const remainingOwners = await prisma.workspaceMembership.count({
      where: { workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
    });
    expect(remainingOwners).toBe(1); // never zero, never two accidental removals
  }, 15_000);

  it("concurrent transfer-vs-removal targeting the same owner never produces zero owners", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const incoming = await addMember(workspace.id, "ADMIN");

    const results = await Promise.allSettled([
      transferOwnership(prisma, {
        workspaceId: workspace.id,
        fromMembershipId: owner.id,
        toMembershipId: incoming.id,
        actorUserId: owner.userId,
      }),
      removeMembership(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        actorUserId: owner.userId,
      }),
    ]);

    // Whichever operation lost the race must have failed cleanly (a real Error), not left
    // the database in an inconsistent state.
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(Error);
      }
    }

    const remainingOwners = await prisma.workspaceMembership.count({
      where: { workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
    });
    expect(remainingOwners).toBeGreaterThanOrEqual(1);
  }, 15_000);
});
