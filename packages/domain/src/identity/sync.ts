import type { PrismaClient } from "@prisma/client";
import { findUserByClerkId, softDeleteUser, syncUserProfile } from "./users.js";
import {
  createWorkspaceWithOwner,
  findWorkspaceByClerkOrgId,
  markWorkspaceDeleted,
  syncWorkspaceProfile,
} from "./workspaces.js";
import { removeMembershipFromSync, upsertMembershipFromSync } from "./memberships.js";
import { DeferredSyncError } from "./errors.js";

/**
 * Normalized sync inputs — deliberately decoupled from `@clerk/backend`'s own JSON/webhook
 * types so this package never needs to depend on the Clerk SDK. The caller (the webhook
 * worker, for both live webhook events and reconciliation) maps Clerk's shapes into these.
 */

export interface ClerkUserSyncInput {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
  updatedAt: Date;
}

export interface ClerkUserDeletedInput {
  clerkUserId: string;
}

export interface ClerkOrganizationSyncInput {
  clerkOrganizationId: string;
  name: string;
  createdByClerkUserId: string | null;
  updatedAt: Date;
  correlationId?: string | null;
}

export interface ClerkOrganizationDeletedInput {
  clerkOrganizationId: string;
  correlationId?: string | null;
}

export interface ClerkMembershipSyncInput {
  clerkOrganizationId: string;
  clerkUserId: string;
  updatedAt: Date;
}

export interface ClerkMembershipRemovedInput {
  clerkOrganizationId: string;
  clerkUserId: string;
  updatedAt: Date;
  correlationId?: string | null;
}

export async function syncUserCreatedOrUpdated(prisma: PrismaClient, input: ClerkUserSyncInput) {
  return syncUserProfile(prisma, {
    clerkUserId: input.clerkUserId,
    email: input.email,
    displayName: input.displayName,
    syncedAt: input.updatedAt,
  });
}

export async function syncUserDeleted(prisma: PrismaClient, input: ClerkUserDeletedInput) {
  return softDeleteUser(prisma, input.clerkUserId);
}

/**
 * `organization.created`. Requires a `created_by` Clerk user — if the event doesn't carry
 * one (should not happen per Clerk's documented Organization shape, but the field is
 * optional in the SDK's own types), this defers to reconciliation rather than creating an
 * ownerless workspace (see `createWorkspaceWithOwner`'s doc comment for why no other path
 * is allowed to create a Workspace).
 */
export async function syncOrganizationCreated(
  prisma: PrismaClient,
  input: ClerkOrganizationSyncInput,
) {
  if (!input.createdByClerkUserId) {
    throw new DeferredSyncError(
      `organization.created for ${input.clerkOrganizationId} carried no created_by — deferring to reconciliation.`,
    );
  }
  return createWorkspaceWithOwner(prisma, {
    clerkOrganizationId: input.clerkOrganizationId,
    name: input.name,
    ownerClerkUserId: input.createdByClerkUserId,
    syncedAt: input.updatedAt,
    correlationId: input.correlationId,
  });
}

export async function syncOrganizationUpdated(
  prisma: PrismaClient,
  input: ClerkOrganizationSyncInput,
) {
  const workspace = await findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId);
  if (!workspace) {
    throw new DeferredSyncError(
      `organization.updated for ${input.clerkOrganizationId} arrived before its workspace exists locally.`,
    );
  }
  return syncWorkspaceProfile(prisma, {
    clerkOrganizationId: input.clerkOrganizationId,
    name: input.name,
    syncedAt: input.updatedAt,
  });
}

export async function syncOrganizationDeleted(
  prisma: PrismaClient,
  input: ClerkOrganizationDeletedInput,
) {
  return markWorkspaceDeleted(prisma, input.clerkOrganizationId, input.correlationId ?? null);
}

/**
 * `organizationMembership.created`/`.updated` — treated identically (see
 * phase-2-3-implementation-report.md): Clerk's `OrganizationMembershipJSON` carries no
 * distinguishable status field beyond the event firing at all, so both events converge on
 * "ensure an ACTIVE membership row exists, defaulting role to VIEWER on first creation,
 * never touching an existing role." Defers (via `DeferredSyncError`) if the workspace or
 * user "parent" doesn't exist locally yet, per identity-sync.md §3's out-of-order handling.
 */
export async function syncMembershipUpsert(prisma: PrismaClient, input: ClerkMembershipSyncInput) {
  const [workspace, user] = await Promise.all([
    findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId),
    findUserByClerkId(prisma, input.clerkUserId),
  ]);

  if (!workspace) {
    throw new DeferredSyncError(
      `organizationMembership event for org ${input.clerkOrganizationId} arrived before its workspace exists locally.`,
    );
  }
  if (!user) {
    throw new DeferredSyncError(
      `organizationMembership event for user ${input.clerkUserId} arrived before that user exists locally.`,
    );
  }

  return upsertMembershipFromSync(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    syncedAt: input.updatedAt,
  });
}

/** `organizationMembership.deleted`. A missing workspace/user locally means there is
 *  nothing to remove — a no-op, not deferred (there is no "later" state to catch up to). */
export async function syncMembershipRemoved(
  prisma: PrismaClient,
  input: ClerkMembershipRemovedInput,
) {
  const [workspace, user] = await Promise.all([
    findWorkspaceByClerkOrgId(prisma, input.clerkOrganizationId),
    findUserByClerkId(prisma, input.clerkUserId),
  ]);
  if (!workspace || !user) return null;

  return removeMembershipFromSync(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    syncedAt: input.updatedAt,
    correlationId: input.correlationId ?? null,
  });
}
