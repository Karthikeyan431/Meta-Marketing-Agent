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
  InsufficientRoleAuthorityError,
  SelfRoleMutationError,
  OwnerAssignmentNotAllowedError,
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

/** Creates a new VIEWER member, optionally promoted by `actorUserId` (a real, distinct,
 *  already-authorized actor — required for any role above VIEWER, since Phase 2.4 closed
 *  the self-promotion gap). */
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
  if (role !== "VIEWER") {
    if (!actorUserId) {
      throw new Error("addMember: actorUserId is required to promote above VIEWER");
    }
    return changeMembershipRole(prisma, {
      membershipId: membership.id,
      workspaceId,
      newRole: role,
      actorUserId,
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
    // A distinct ADMIN actor (not the owner themselves) isolates this test to the
    // owner-invariant path specifically, rather than the self-mutation path (§8.2 rule 2).
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);

    await expect(
      changeMembershipRole(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        newRole: "ADMIN",
        actorUserId: admin.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerInvariantError);
  });

  it("removing an owner succeeds once a second owner exists", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const secondOwner = await addMember(workspace.id, "ADMIN", owner.userId);
    // An OWNER-acting caller granting OWNER to a different member is a legitimate
    // co-ownership grant (rbac.md §8.2 rule 3) — invariant-safe by construction.
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
    const incoming = await addMember(workspace.id, "ADMIN", owner.userId);

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
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const memberA = await addMember(workspace.id, "ADMIN", owner.userId);
    const memberB = await addMember(workspace.id, "ADMIN", owner.userId);

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
    const ownerB = await addMember(workspace.id, "ADMIN", ownerA.userId);
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
    const incoming = await addMember(workspace.id, "ADMIN", owner.userId);

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

describe("Role-mutation authority & self-escalation prevention (Phase 2.4, rbac.md §8.2, ADR-028)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  it("[E1] a member cannot change their own role, even to a role they'd otherwise qualify to assign", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();

    await expect(
      changeMembershipRole(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        newRole: "ADMIN",
        actorUserId: owner.userId, // acting on themselves
      }),
    ).rejects.toBeInstanceOf(SelfRoleMutationError);
  });

  it("[E2] ADMIN cannot promote a member directly to OWNER via changeMembershipRole()", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      changeMembershipRole(prisma, {
        membershipId: target.id,
        workspaceId: workspace.id,
        newRole: "OWNER",
        actorUserId: admin.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerAssignmentNotAllowedError);

    const stillOriginalRole = await findMembership(prisma, {
      userId: target.userId,
      workspaceId: workspace.id,
    });
    expect(stillOriginalRole?.role).toBe("VIEWER");
  });

  it("[E2] ADMIN cannot promote themselves to OWNER (self-mutation blocks first)", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);

    await expect(
      changeMembershipRole(prisma, {
        membershipId: admin.id,
        workspaceId: workspace.id,
        newRole: "OWNER",
        actorUserId: admin.userId,
      }),
    ).rejects.toBeInstanceOf(SelfRoleMutationError);
  });

  it("MANAGER cannot change any member's role (lacks role-mutation authority)", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const manager = await addMember(workspace.id, "MANAGER", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      changeMembershipRole(prisma, {
        membershipId: target.id,
        workspaceId: workspace.id,
        newRole: "ANALYST",
        actorUserId: manager.userId,
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);
  });

  it("a user with no membership in the workspace cannot change anyone's role", async () => {
    const { workspace } = await seedWorkspaceWithOwner();
    const outsider = await provisionUser(prisma, { clerkUserId: testClerkUserId() });
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      changeMembershipRole(prisma, {
        membershipId: target.id,
        workspaceId: workspace.id,
        newRole: "ANALYST",
        actorUserId: outsider.id,
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);
  });

  it("OWNER granting OWNER to a different member succeeds (legitimate co-ownership grant)", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);

    const updated = await changeMembershipRole(prisma, {
      membershipId: admin.id,
      workspaceId: workspace.id,
      newRole: "OWNER",
      actorUserId: owner.userId,
    });
    expect(updated.role).toBe("OWNER");

    const ownerCount = await prisma.workspaceMembership.count({
      where: { workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" },
    });
    expect(ownerCount).toBe(2);
  });

  it("a member can always remove themselves ('leave the workspace'), regardless of role", async () => {
    const { workspace } = await seedWorkspaceWithOwner();
    const viewer = await addMember(workspace.id, "VIEWER");

    const removed = await removeMembership(prisma, {
      membershipId: viewer.id,
      workspaceId: workspace.id,
      actorUserId: viewer.userId,
    });
    expect(removed.status).toBe("REMOVED");
  });

  it("MANAGER cannot remove a different member (lacks role-mutation authority)", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const manager = await addMember(workspace.id, "MANAGER", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      removeMembership(prisma, {
        membershipId: target.id,
        workspaceId: workspace.id,
        actorUserId: manager.userId,
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);
  });

  it("ADMIN can remove a different member", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    const removed = await removeMembership(prisma, {
      membershipId: target.id,
      workspaceId: workspace.id,
      actorUserId: admin.userId,
    });
    expect(removed.status).toBe("REMOVED");
  });

  it("[transferOwnership actor-identity gap, found in Phase 2.4 review] a non-owner cannot orchestrate a transfer of someone else's ownership", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      transferOwnership(prisma, {
        workspaceId: workspace.id,
        fromMembershipId: owner.id, // a real owner
        toMembershipId: target.id,
        actorUserId: admin.userId, // but the ADMIN is not that owner
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);

    const ownerUnchanged = await findMembership(prisma, {
      userId: owner.userId,
      workspaceId: workspace.id,
    });
    expect(ownerUnchanged?.role).toBe("OWNER");
  });

  it("an OWNER cannot orchestrate a transfer between two other members' memberships", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const secondOwner = await addMember(workspace.id, "ADMIN", owner.userId);
    await changeMembershipRole(prisma, {
      membershipId: secondOwner.id,
      workspaceId: workspace.id,
      newRole: "OWNER",
      actorUserId: owner.userId,
    });
    const target = await addMember(workspace.id, "VIEWER");

    // `owner` attempts to transfer secondOwner's ownership to target — owner is a real
    // OWNER, but not the `from` membership itself.
    await expect(
      transferOwnership(prisma, {
        workspaceId: workspace.id,
        fromMembershipId: secondOwner.id,
        toMembershipId: target.id,
        actorUserId: owner.userId,
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);
  });
});

describe("Authorization denial audit trail (Phase 2.4 Step 8)", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { clerkOrganizationId: { in: clerkOrgIds } } });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
  });

  it("a denied role change writes a FAILURE-outcome AuditEvent, distinct from a successful change", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const manager = await addMember(workspace.id, "MANAGER", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      changeMembershipRole(prisma, {
        membershipId: target.id,
        workspaceId: workspace.id,
        newRole: "ANALYST",
        actorUserId: manager.userId,
        correlationId: "test-denial-correlation-1",
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);

    const denialEvent = await prisma.auditEvent.findFirst({
      where: { workspaceId: workspace.id, eventType: "membership.role_change_denied" },
    });
    expect(denialEvent).not.toBeNull();
    expect(denialEvent?.outcome).toBe("FAILURE");
    expect(denialEvent?.actorId).toBe(manager.userId);
    expect(denialEvent?.correlationId).toBe("test-denial-correlation-1");
  });

  it("a denied owner-removal writes a FAILURE-outcome AuditEvent", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();

    await expect(
      removeMembership(prisma, {
        membershipId: owner.id,
        workspaceId: workspace.id,
        actorUserId: owner.userId,
      }),
    ).rejects.toBeInstanceOf(OwnerInvariantError);

    const denialEvent = await prisma.auditEvent.findFirst({
      where: { workspaceId: workspace.id, eventType: "membership.removal_denied" },
    });
    expect(denialEvent).not.toBeNull();
    expect(denialEvent?.outcome).toBe("FAILURE");
  });

  it("a denied ownership transfer writes a FAILURE-outcome AuditEvent", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const admin = await addMember(workspace.id, "ADMIN", owner.userId);
    const target = await addMember(workspace.id, "VIEWER");

    await expect(
      transferOwnership(prisma, {
        workspaceId: workspace.id,
        fromMembershipId: owner.id,
        toMembershipId: target.id,
        actorUserId: admin.userId, // not the outgoing owner
      }),
    ).rejects.toBeInstanceOf(InsufficientRoleAuthorityError);

    const denialEvent = await prisma.auditEvent.findFirst({
      where: { workspaceId: workspace.id, eventType: "workspace.ownership_transfer_denied" },
    });
    expect(denialEvent).not.toBeNull();
    expect(denialEvent?.outcome).toBe("FAILURE");
    expect(denialEvent?.actorId).toBe(admin.userId);
  });

  it("a successful role change still only writes the SUCCESS audit event, never a denial event", async () => {
    const { workspace, owner } = await seedWorkspaceWithOwner();
    const target = await addMember(workspace.id, "VIEWER");

    await changeMembershipRole(prisma, {
      membershipId: target.id,
      workspaceId: workspace.id,
      newRole: "ANALYST",
      actorUserId: owner.userId,
    });

    const denialEvent = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: workspace.id,
        eventType: "membership.role_change_denied",
        resourceId: target.id,
      },
    });
    expect(denialEvent).toBeNull();

    const successEvent = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: workspace.id,
        eventType: "membership.role_changed",
        resourceId: target.id,
      },
    });
    expect(successEvent?.outcome).toBe("SUCCESS");
  });
});
