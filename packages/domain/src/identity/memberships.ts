import type { PrismaClient, Prisma, Role, WorkspaceMembership } from "@prisma/client";
import { recordAuditEvent } from "./audit.js";
import { MembershipNotFoundError, OwnerInvariantError } from "./errors.js";

export async function findMembership(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string },
): Promise<WorkspaceMembership | null> {
  return prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
  });
}

export async function findMembershipById(
  prisma: PrismaClient,
  id: string,
): Promise<WorkspaceMembership | null> {
  return prisma.workspaceMembership.findUnique({ where: { id } });
}

export interface MembershipWithWorkspace extends WorkspaceMembership {
  workspace: { id: string; name: string; status: string; clerkOrganizationId: string | null };
}

/** Every workspace an active member belongs to — `GET /workspaces` / `GET /me`
 *  (identity-api-contracts.md). */
export async function listActiveMembershipsForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<MembershipWithWorkspace[]> {
  return prisma.workspaceMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      workspace: { select: { id: true, name: true, status: true, clerkOrganizationId: true } },
    },
    orderBy: { createdAt: "asc" },
  }) as unknown as Promise<MembershipWithWorkspace[]>;
}

export interface MembershipWithUser extends WorkspaceMembership {
  user: { id: string; clerkUserId: string };
}

/** Every active member of a workspace, with each member's Clerk user ID — used by
 *  reconciliation (workers/webhook/src/reconcile.ts) to true-up removed memberships. */
export async function listActiveMembershipsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<MembershipWithUser[]> {
  return prisma.workspaceMembership.findMany({
    where: { workspaceId, status: "ACTIVE" },
    include: { user: { select: { id: true, clerkUserId: true } } },
  }) as unknown as Promise<MembershipWithUser[]>;
}

/**
 * Locks every currently-ACTIVE OWNER membership row for a workspace (`SELECT ... FOR
 * UPDATE`) so concurrent owner-changing operations against the same workspace serialize
 * against each other — the mechanism that makes the "never zero owners" invariant safe
 * under concurrency (workspace-model.md §5), not just correct in the single-request case.
 * Must be called inside the same `$transaction` as the mutation it protects.
 */
async function lockActiveOwnerRows(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM workspace_memberships
    WHERE workspace_id = ${workspaceId}::uuid AND role = 'OWNER' AND status = 'ACTIVE'
    FOR UPDATE
  `;
}

export interface RemoveMembershipInput {
  membershipId: string;
  workspaceId: string;
  actorUserId: string;
  correlationId?: string | null;
}

/**
 * Application-initiated membership removal (Phase 2.3 Step 6 / `members.remove`). Blocks
 * removal of a workspace's last active OWNER — the caller must transfer ownership first
 * (`transferOwnership` below). Transactional and safe under concurrent owner-removal
 * attempts against the same workspace (see `lockActiveOwnerRows`).
 */
export async function removeMembership(
  prisma: PrismaClient,
  input: RemoveMembershipInput,
): Promise<WorkspaceMembership> {
  return prisma.$transaction(async (tx) => {
    const ownerRows = await lockActiveOwnerRows(tx, input.workspaceId);

    const membership = await tx.workspaceMembership.findUnique({
      where: { id: input.membershipId },
    });
    if (
      !membership ||
      membership.workspaceId !== input.workspaceId ||
      membership.status !== "ACTIVE"
    ) {
      throw new MembershipNotFoundError();
    }

    if (membership.role === "OWNER" && ownerRows.length <= 1) {
      throw new OwnerInvariantError("Cannot remove the last owner of a workspace.");
    }

    const updated = await tx.workspaceMembership.update({
      where: { id: membership.id },
      data: { status: "REMOVED", removedAt: new Date() },
    });

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: "membership.removed",
      resourceType: "workspace_membership",
      resourceId: membership.id,
      action: "remove",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
      metadata: { removedUserId: membership.userId, role: membership.role },
    });

    return updated;
  });
}

export interface ChangeMembershipRoleInput {
  membershipId: string;
  workspaceId: string;
  newRole: Role;
  actorUserId: string;
  correlationId?: string | null;
}

/** Application-initiated role change (Phase 2.3 Step 6 / `members.update`). Blocks
 *  demoting a workspace's last active OWNER away from OWNER. */
export async function changeMembershipRole(
  prisma: PrismaClient,
  input: ChangeMembershipRoleInput,
): Promise<WorkspaceMembership> {
  return prisma.$transaction(async (tx) => {
    const ownerRows = await lockActiveOwnerRows(tx, input.workspaceId);

    const membership = await tx.workspaceMembership.findUnique({
      where: { id: input.membershipId },
    });
    if (
      !membership ||
      membership.workspaceId !== input.workspaceId ||
      membership.status !== "ACTIVE"
    ) {
      throw new MembershipNotFoundError();
    }

    if (membership.role === "OWNER" && input.newRole !== "OWNER" && ownerRows.length <= 1) {
      throw new OwnerInvariantError("Cannot demote the last owner of a workspace.");
    }

    const updated = await tx.workspaceMembership.update({
      where: { id: membership.id },
      data: { role: input.newRole },
    });

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: "membership.role_changed",
      resourceType: "workspace_membership",
      resourceId: membership.id,
      action: "update",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
      metadata: { userId: membership.userId, fromRole: membership.role, toRole: input.newRole },
    });

    return updated;
  });
}

export interface TransferOwnershipInput {
  workspaceId: string;
  fromMembershipId: string;
  toMembershipId: string;
  actorUserId: string;
  correlationId?: string | null;
}

/**
 * Atomic ownership transfer (workspace-model.md §5, ADR-020): the outgoing owner becomes
 * ADMIN (never removed as a side effect — a separate `removeMembership` call handles that,
 * if desired, once they're no longer the last owner), the incoming member becomes OWNER.
 * Never produces a window where the workspace has zero active owners.
 */
export async function transferOwnership(
  prisma: PrismaClient,
  input: TransferOwnershipInput,
): Promise<{ from: WorkspaceMembership; to: WorkspaceMembership }> {
  return prisma.$transaction(async (tx) => {
    await lockActiveOwnerRows(tx, input.workspaceId);

    const [from, to] = await Promise.all([
      tx.workspaceMembership.findUnique({ where: { id: input.fromMembershipId } }),
      tx.workspaceMembership.findUnique({ where: { id: input.toMembershipId } }),
    ]);

    if (!from || from.workspaceId !== input.workspaceId || from.status !== "ACTIVE") {
      throw new MembershipNotFoundError("Outgoing owner membership not found.");
    }
    if (!to || to.workspaceId !== input.workspaceId || to.status !== "ACTIVE") {
      throw new MembershipNotFoundError("Incoming owner membership not found.");
    }
    if (from.role !== "OWNER") {
      throw new OwnerInvariantError("Source membership is not an owner.");
    }
    if (from.id === to.id) {
      throw new OwnerInvariantError("Cannot transfer ownership to the same membership.");
    }

    const [updatedFrom, updatedTo] = await Promise.all([
      tx.workspaceMembership.update({ where: { id: from.id }, data: { role: "ADMIN" } }),
      tx.workspaceMembership.update({ where: { id: to.id }, data: { role: "OWNER" } }),
    ]);

    await recordAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorId: input.actorUserId,
      eventType: "workspace.ownership_transferred",
      resourceType: "workspace_membership",
      resourceId: to.id,
      action: "transfer",
      outcome: "SUCCESS",
      correlationId: input.correlationId ?? null,
      metadata: { fromUserId: from.userId, toUserId: to.userId },
    });

    return { from: updatedFrom, to: updatedTo };
  });
}

export interface UpsertMembershipFromSyncInput {
  workspaceId: string;
  userId: string;
  syncedAt: Date;
}

/**
 * `organizationMembership.created`/`.updated` sync (identity-sync.md §1): role is NEVER
 * taken from the Clerk event — a newly synced membership defaults to VIEWER (the
 * least-privileged role) until explicitly assigned by an OWNER/ADMIN in our own system. An
 * existing membership's role is never touched here, only its status/sync timestamp.
 */
export async function upsertMembershipFromSync(
  prisma: PrismaClient,
  input: UpsertMembershipFromSyncInput,
): Promise<WorkspaceMembership> {
  const existing = await findMembership(prisma, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  if (!existing) {
    return prisma.workspaceMembership.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: "VIEWER",
        status: "ACTIVE",
        clerkSyncedAt: input.syncedAt,
      },
    });
  }

  if (existing.clerkSyncedAt && input.syncedAt <= existing.clerkSyncedAt) {
    return existing; // stale/out-of-order event — no-op
  }

  if (existing.status === "ACTIVE") {
    return prisma.workspaceMembership.update({
      where: { id: existing.id },
      data: { clerkSyncedAt: input.syncedAt },
    });
  }

  // A membership Clerk still reports as current, reappearing after a local REMOVED state
  // (e.g. re-invited) — reactivate status, never touch role.
  return prisma.workspaceMembership.update({
    where: { id: existing.id },
    data: { status: "ACTIVE", removedAt: null, clerkSyncedAt: input.syncedAt },
  });
}

export interface RemoveMembershipFromSyncInput {
  workspaceId: string;
  userId: string;
  syncedAt: Date;
  correlationId?: string | null;
}

/**
 * `organizationMembership.deleted` sync. Unlike `removeMembership()` (application-
 * initiated), this never blocks — Clerk is authoritative for who is actually in the
 * organization, and we cannot refuse a fact Clerk has already enacted. If this removal
 * would leave the workspace with zero active owners, it still applies, but writes a
 * FAILURE-outcome audit event flagging it — "never silently orphan a workspace" (ADR-020)
 * means never silently, not never at all.
 */
export async function removeMembershipFromSync(
  prisma: PrismaClient,
  input: RemoveMembershipFromSyncInput,
): Promise<WorkspaceMembership | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    });
    if (!existing || existing.status === "REMOVED") return existing;
    if (existing.clerkSyncedAt && input.syncedAt <= existing.clerkSyncedAt) return existing;

    const wasActiveOwner = existing.role === "OWNER" && existing.status === "ACTIVE";

    const updated = await tx.workspaceMembership.update({
      where: { id: existing.id },
      data: { status: "REMOVED", removedAt: new Date(), clerkSyncedAt: input.syncedAt },
    });

    if (wasActiveOwner) {
      const remainingOwners = await tx.workspaceMembership.count({
        where: { workspaceId: input.workspaceId, role: "OWNER", status: "ACTIVE" },
      });
      if (remainingOwners === 0) {
        await recordAuditEvent(tx, {
          workspaceId: input.workspaceId,
          actorType: "WEBHOOK",
          actorId: "clerk-sync",
          eventType: "workspace.owner_invariant_violated",
          resourceType: "workspace",
          resourceId: input.workspaceId,
          action: "membership.removed",
          outcome: "FAILURE",
          correlationId: input.correlationId ?? null,
          metadata: {
            reason: "last owner removed via external Clerk membership change",
            removedUserId: input.userId,
          },
        });
      }
    }

    return updated;
  });
}
