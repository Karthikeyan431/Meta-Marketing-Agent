import type { PrismaClient, Workspace, WorkspaceMembership } from "@prisma/client";
import { isUniqueConstraintViolation } from "../prisma-errors.js";
import { provisionUser } from "./users.js";
import { recordAuditEvent } from "./audit.js";

export async function findWorkspaceByClerkOrgId(
  prisma: PrismaClient,
  clerkOrganizationId: string,
): Promise<Workspace | null> {
  return prisma.workspace.findUnique({ where: { clerkOrganizationId } });
}

export async function findWorkspaceById(
  prisma: PrismaClient,
  id: string,
): Promise<Workspace | null> {
  return prisma.workspace.findUnique({ where: { id } });
}

export interface CreateWorkspaceWithOwnerInput {
  clerkOrganizationId: string;
  name: string;
  ownerClerkUserId: string;
  syncedAt: Date;
  correlationId?: string | null;
}

export interface CreateWorkspaceWithOwnerResult {
  workspace: Workspace;
  ownerMembership: WorkspaceMembership | null;
  created: boolean;
}

/**
 * The ONLY code path that creates a Workspace row (Phase 2.3 design decision — see
 * phase-2-3-implementation-report.md §"Clerk Organization → Workspace"). Always pairs
 * workspace creation with its first membership as OWNER, atomically, so a Workspace can
 * never be observed without an owner. Invoked exclusively from the webhook
 * (`organization.created`) and reconciliation sync pipelines — never from a request-time
 * path — because both already carry a verified, Clerk-authoritative "who created this"
 * fact (`organization.created_by`), and a request-time path would have no such
 * authoritative answer under concurrent access by multiple org members.
 *
 * Idempotent: a pre-check returns the existing workspace on a simple replay; the database's
 * unique constraint on `clerk_organization_id` is the final protection against a true race
 * (e.g. a webhook and a reconciliation pass observing the same new organization at once).
 */
export async function createWorkspaceWithOwner(
  prisma: PrismaClient,
  input: CreateWorkspaceWithOwnerInput,
): Promise<CreateWorkspaceWithOwnerResult> {
  const existing = await findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId);
  if (existing) {
    const ownerMembership = await prisma.workspaceMembership.findFirst({
      where: { workspaceId: existing.id, role: "OWNER", status: "ACTIVE" },
    });
    return { workspace: existing, ownerMembership, created: false };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await provisionUser(tx, { clerkUserId: input.ownerClerkUserId });
      const workspace = await tx.workspace.create({
        data: {
          clerkOrganizationId: input.clerkOrganizationId,
          name: input.name,
          clerkSyncedAt: input.syncedAt,
        },
      });
      const ownerMembership = await tx.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: "OWNER",
          status: "ACTIVE",
          clerkSyncedAt: input.syncedAt,
        },
      });
      await recordAuditEvent(tx, {
        workspaceId: workspace.id,
        actorType: "WEBHOOK",
        actorId: "clerk-sync",
        eventType: "workspace.created",
        resourceType: "workspace",
        resourceId: workspace.id,
        action: "create",
        outcome: "SUCCESS",
        correlationId: input.correlationId ?? null,
        metadata: {
          clerkOrganizationId: input.clerkOrganizationId,
          ownerClerkUserId: input.ownerClerkUserId,
        },
      });
      return { workspace, ownerMembership, created: true };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error, "clerk_organization_id")) {
      const raced = await findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId);
      if (raced) {
        const ownerMembership = await prisma.workspaceMembership.findFirst({
          where: { workspaceId: raced.id, role: "OWNER", status: "ACTIVE" },
        });
        return { workspace: raced, ownerMembership, created: false };
      }
    }
    throw error;
  }
}

export interface SyncWorkspaceProfileInput {
  clerkOrganizationId: string;
  name: string;
  syncedAt: Date;
}

/** `organization.updated` sync — name only; `status`/`timezone`/`configuration` are
 *  application-owned and never overwritten by Clerk data (identity-sync.md §1). */
export async function syncWorkspaceProfile(
  prisma: PrismaClient,
  input: SyncWorkspaceProfileInput,
): Promise<Workspace | null> {
  const existing = await findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId);
  if (!existing) return null;
  if (existing.clerkSyncedAt && input.syncedAt <= existing.clerkSyncedAt) return existing;

  return prisma.workspace.update({
    where: { id: existing.id },
    data: { name: input.name, clerkSyncedAt: input.syncedAt },
  });
}

/** `organization.deleted` sync (identity-sync.md §1) — marks the workspace inactive; never
 *  hard-deletes (preserves audit history per DATA_RETENTION.md). */
export async function markWorkspaceDeleted(
  prisma: PrismaClient,
  clerkOrganizationId: string,
  correlationId?: string | null,
): Promise<Workspace | null> {
  const existing = await findWorkspaceByClerkOrgId(prisma, clerkOrganizationId);
  if (!existing || existing.status === "DELETED") return existing;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.update({
      where: { id: existing.id },
      data: { status: "DELETED" },
    });
    await recordAuditEvent(tx, {
      workspaceId: existing.id,
      actorType: "WEBHOOK",
      actorId: "clerk-sync",
      eventType: "workspace.deleted",
      resourceType: "workspace",
      resourceId: existing.id,
      action: "delete",
      outcome: "SUCCESS",
      correlationId: correlationId ?? null,
    });
    return updated;
  });
}
