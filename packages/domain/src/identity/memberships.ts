import type { PrismaClient, Prisma, Role, WorkspaceMembership } from "@prisma/client";
import { recordAuditEvent } from "./audit.js";
import {
  MembershipNotFoundError,
  OwnerInvariantError,
  InsufficientRoleAuthorityError,
  SelfRoleMutationError,
  OwnerAssignmentNotAllowedError,
} from "./errors.js";

/** Roles permitted to invite/update/remove members at all — rbac.md §8.1
 *  (`members.invite`/`members.update`/`members.remove` are OWNER/ADMIN only). Re-checked
 *  fresh, inside the mutating transaction, as a domain-layer defense-in-depth control —
 *  never assumes an API-layer `requirePermission()` already ran (Phase 2.4A, ADR-028). */
const ROLE_MUTATION_AUTHORITY_ROLES: readonly Role[] = ["OWNER", "ADMIN"];

/**
 * Fetches the acting user's CURRENT membership in the workspace (fresh, inside the caller's
 * transaction) and verifies it is active and holds OWNER or ADMIN. Throws
 * `InsufficientRoleAuthorityError` otherwise — including when the actor has no membership
 * in this workspace at all, which is itself a form of insufficient authority, not a
 * separate "not found" case (never reveals whether the actor "would" have had authority in
 * some other workspace).
 */
async function requireRoleMutationAuthority(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; actorUserId: string },
): Promise<WorkspaceMembership> {
  const actor = await tx.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId } },
  });

  if (!actor || actor.status !== "ACTIVE" || !ROLE_MUTATION_AUTHORITY_ROLES.includes(actor.role)) {
    throw new InsufficientRoleAuthorityError();
  }

  return actor;
}

/**
 * Wraps a mutation's transaction to additionally capture authorization/invariant denials as
 * a `FAILURE`-outcome `AuditEvent` (Phase 2.4 Step 8: "permission denial," "owner-removal
 * rejection" are required audit categories). Written as a **separate**, non-transactional
 * insert after the mutation's own transaction has already rolled back — a denial audit row
 * cannot live inside the same transaction as the mutation it describes, since that
 * transaction is exactly what failed. `describeDenial` returns `null` for errors that
 * aren't a security-relevant denial (e.g. `MembershipNotFoundError` — a resource-not-found
 * outcome, not an authorization decision), in which case nothing is audited and the
 * original error still propagates unchanged.
 */
async function withDenialAudit<T>(
  prisma: PrismaClient,
  run: () => Promise<T>,
  describeDenial: (error: Error) => {
    workspaceId: string;
    actorUserId: string;
    eventType: string;
    resourceType: string;
    resourceId?: string | null;
    action: string;
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  } | null,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error) {
      const denial = describeDenial(error);
      if (denial) {
        await recordAuditEvent(prisma, {
          workspaceId: denial.workspaceId,
          actorType: "USER",
          actorId: denial.actorUserId,
          eventType: denial.eventType,
          resourceType: denial.resourceType,
          resourceId: denial.resourceId ?? null,
          action: denial.action,
          outcome: "FAILURE",
          correlationId: denial.correlationId ?? null,
          metadata: {
            ...denial.metadata,
            errorCode: (error as { code?: string }).code,
            errorMessage: error.message,
          },
        });
      }
    }
    throw error;
  }
}

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
 * Application-initiated membership removal (Phase 2.3 Step 6 / `members.remove`; actor
 * authority hardened Phase 2.4, ADR-028). Blocks removal of a workspace's last active
 * OWNER — the caller must transfer ownership first (`transferOwnership` below).
 * Transactional and safe under concurrent owner-removal attempts against the same
 * workspace (see `lockActiveOwnerRows`).
 *
 * Authority model: a member may always remove **themselves** ("leave the workspace"),
 * regardless of role — subject to the owner invariant below, which still blocks a sole
 * owner from leaving without transferring first. Removing **someone else** requires the
 * actor to currently hold OWNER or ADMIN (`requireRoleMutationAuthority`, re-checked fresh
 * inside this transaction — never trusts a prior, possibly-stale, API-layer check alone).
 */
export async function removeMembership(
  prisma: PrismaClient,
  input: RemoveMembershipInput,
): Promise<WorkspaceMembership> {
  return withDenialAudit(
    prisma,
    () => removeMembershipTx(prisma, input),
    (error) => {
      if (error instanceof InsufficientRoleAuthorityError || error instanceof OwnerInvariantError) {
        return {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: "membership.removal_denied",
          resourceType: "workspace_membership",
          resourceId: input.membershipId,
          action: "remove",
          correlationId: input.correlationId,
          metadata: { reason: error.name },
        };
      }
      return null;
    },
  );
}

async function removeMembershipTx(
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

    if (membership.userId !== input.actorUserId) {
      await requireRoleMutationAuthority(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
      });
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

/**
 * Application-initiated role change (Phase 2.3 Step 6 / `members.update`; hardened Phase
 * 2.4, ADR-028 — closes the OWNER-assignment gap identified during Phase 2.4A review).
 *
 * **Design correction made during Phase 2.4 implementation** (documented transparently,
 * not silently): Phase 2.4A's `rbac.md` §8.2 originally specified an *unconditional* ban on
 * `newRole === "OWNER"` through this function. Implementing that literally would have made
 * co-ownership entirely unreachable — contradicting the older, already-approved
 * `workspace-model.md` §5 / ADR-020, which explicitly treats "another active owner"
 * existing as a legitimate alternative to `transferOwnership()` when removing an owner (an
 * alternative that can only ever arise if a workspace can legitimately reach 2+ owners in
 * the first place). The refined rule below resolves that internal contradiction in favor
 * of the older, more foundational decision: adding a co-owner is invariant-safe by
 * construction (it can never cause zero owners) and is only unsafe when it amounts to
 * *escalation* — so it is restricted to OWNER-acting-only, never ADMIN, and never
 * self-service.
 *
 * Checks run before any owner-invariant or persistence logic, in this order:
 * 1. **Actor authority** — the actor must currently hold OWNER or ADMIN in this workspace
 *    (`requireRoleMutationAuthority`), re-checked fresh, never trusted from a prior call.
 * 2. **No self-mutation** — a membership can never change its own role (rbac.md §8.2 rule
 *    3), regardless of what role the actor holds or is requesting — this alone already
 *    closes the original self-escalation vector.
 * 3. **OWNER assignment requires an OWNER actor** — `newRole === "OWNER"` is rejected
 *    unless the acting membership's role is itself OWNER; an ADMIN can never grant OWNER to
 *    anyone, including another ADMIN, regardless of any other permission they hold.
 *
 * Only after all of the above does the existing owner-invariant demotion check run.
 */
export async function changeMembershipRole(
  prisma: PrismaClient,
  input: ChangeMembershipRoleInput,
): Promise<WorkspaceMembership> {
  return withDenialAudit(
    prisma,
    () => changeMembershipRoleTx(prisma, input),
    (error) => {
      if (
        error instanceof InsufficientRoleAuthorityError ||
        error instanceof SelfRoleMutationError ||
        error instanceof OwnerAssignmentNotAllowedError ||
        error instanceof OwnerInvariantError
      ) {
        return {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: "membership.role_change_denied",
          resourceType: "workspace_membership",
          resourceId: input.membershipId,
          action: "update",
          correlationId: input.correlationId,
          metadata: { reason: error.name, requestedRole: input.newRole },
        };
      }
      return null;
    },
  );
}

async function changeMembershipRoleTx(
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

    const actor = await requireRoleMutationAuthority(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
    });

    if (membership.userId === input.actorUserId) {
      throw new SelfRoleMutationError();
    }

    if (input.newRole === "OWNER" && actor.role !== "OWNER") {
      throw new OwnerAssignmentNotAllowedError();
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
 *
 * **Hardened Phase 2.4 (ADR-028):** `input.actorUserId` must equal the outgoing (`from`)
 * membership's own `userId` — an OWNER may only transfer away *their own* ownership, never
 * orchestrate a transfer between two other members' memberships on their behalf. Phase
 * 2.4A's `rbac.md` §8.2 rule 4 asserted this was "already implicitly true"; it was not —
 * found and closed during Phase 2.4 implementation review. Without this check, any caller
 * naming a real owner's `fromMembershipId` could transfer that owner's role away
 * regardless of who was actually acting.
 */
export async function transferOwnership(
  prisma: PrismaClient,
  input: TransferOwnershipInput,
): Promise<{ from: WorkspaceMembership; to: WorkspaceMembership }> {
  return withDenialAudit(
    prisma,
    () => transferOwnershipTx(prisma, input),
    (error) => {
      if (error instanceof InsufficientRoleAuthorityError || error instanceof OwnerInvariantError) {
        return {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: "workspace.ownership_transfer_denied",
          resourceType: "workspace_membership",
          resourceId: input.fromMembershipId,
          action: "transfer",
          correlationId: input.correlationId,
          metadata: { reason: error.name, toMembershipId: input.toMembershipId },
        };
      }
      return null;
    },
  );
}

async function transferOwnershipTx(
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
    if (from.userId !== input.actorUserId) {
      throw new InsufficientRoleAuthorityError(
        "Only the outgoing owner may initiate their own ownership transfer.",
      );
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
