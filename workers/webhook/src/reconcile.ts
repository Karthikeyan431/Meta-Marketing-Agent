import type { ClerkClient, Organization, User } from "@clerk/backend";
import type { Logger } from "@ai-marketing-manager/config";
import { generateRequestId } from "@ai-marketing-manager/config";
import {
  findWorkspaceByClerkOrgId,
  listActiveMembershipsForWorkspace,
  recordAuditEvent,
  removeMembershipFromSync,
  syncMembershipUpsert,
  syncOrganizationCreated,
  syncUserCreatedOrUpdated,
  syncWorkspaceProfile,
  DeferredSyncError,
  type PrismaClient,
} from "@ai-marketing-manager/domain";

const PAGE_SIZE = 100;

export interface ReconcileIdentityDeps {
  prisma: PrismaClient;
  clerkClient: ClerkClient;
  logger: Logger;
}

export interface ReconcileIdentitySummary {
  usersScanned: number;
  organizationsScanned: number;
  workspacesCreated: number;
  workspacesUpdated: number;
  membershipsUpserted: number;
  membershipsRemoved: number;
  discrepancies: number;
}

/**
 * The reconciliation backstop (identity-sync.md §4, ADR-021): pulls current
 * user/organization/membership state from Clerk's Backend API and reconciles it against
 * our database using the same fetch → normalize → upsert-by-external-identity →
 * mark-observed pattern already established for Meta sync. Never trusts webhook delivery
 * as complete or ordered (identity-sync.md §3) — this is the authority that eventually
 * corrects anything a missed/failed/out-of-order webhook left behind.
 *
 * Scoped identically to the webhook path: never grants a permission/role from Clerk data,
 * never creates a workspace without a resolvable owner, never silently drops the "zero
 * owners" signal (see removeMembershipFromSync's audit behavior).
 */
export async function reconcileIdentity(
  deps: ReconcileIdentityDeps,
): Promise<ReconcileIdentitySummary> {
  const { prisma, clerkClient, logger } = deps;
  const correlationId = generateRequestId();
  const summary: ReconcileIdentitySummary = {
    usersScanned: 0,
    organizationsScanned: 0,
    workspacesCreated: 0,
    workspacesUpdated: 0,
    membershipsUpserted: 0,
    membershipsRemoved: 0,
    discrepancies: 0,
  };

  for await (const user of paginate((offset) =>
    clerkClient.users.getUserList({ limit: PAGE_SIZE, offset }),
  )) {
    summary.usersScanned += 1;
    await syncUserCreatedOrUpdated(prisma, {
      clerkUserId: user.id,
      email: primaryEmail(user),
      displayName: displayName(user),
      updatedAt: new Date(user.updatedAt),
    });
  }

  for await (const org of paginate((offset) =>
    clerkClient.organizations.getOrganizationList({ limit: PAGE_SIZE, offset }),
  )) {
    summary.organizationsScanned += 1;
    const workspace = await reconcileOrganization(prisma, org, correlationId, logger);
    if (!workspace) {
      summary.discrepancies += 1;
      continue;
    }
    if (workspace.created) summary.workspacesCreated += 1;
    else summary.workspacesUpdated += 1;

    const seenClerkUserIds = new Set<string>();
    for await (const membership of paginate((offset) =>
      clerkClient.organizations.getOrganizationMembershipList({
        organizationId: org.id,
        limit: PAGE_SIZE,
        offset,
      }),
    )) {
      const clerkUserId = membership.publicUserData?.userId;
      if (!clerkUserId) continue;
      seenClerkUserIds.add(clerkUserId);

      try {
        await syncMembershipUpsert(prisma, {
          clerkOrganizationId: org.id,
          clerkUserId,
          updatedAt: new Date(membership.updatedAt),
        });
        summary.membershipsUpserted += 1;
      } catch (error) {
        if (error instanceof DeferredSyncError) {
          logger.warn(
            { err: error.message, clerkOrganizationId: org.id, clerkUserId },
            "reconciliation deferred a membership",
          );
          summary.discrepancies += 1;
          continue;
        }
        throw error;
      }
    }

    const localActive = await listActiveMembershipsForWorkspace(prisma, workspace.id);
    for (const membership of localActive) {
      if (seenClerkUserIds.has(membership.user.clerkUserId)) continue;
      await removeMembershipFromSync(prisma, {
        workspaceId: workspace.id,
        userId: membership.userId,
        syncedAt: new Date(),
        correlationId,
      });
      summary.membershipsRemoved += 1;
    }
  }

  await recordAuditEvent(prisma, {
    workspaceId: null,
    actorType: "RECONCILIATION",
    actorId: "clerk-reconciliation",
    eventType: "identity.reconciliation_completed",
    action: "reconcile",
    outcome: "SUCCESS",
    correlationId,
    metadata: { ...summary },
  });

  return summary;
}

async function reconcileOrganization(
  prisma: PrismaClient,
  org: Organization,
  correlationId: string,
  logger: Logger,
): Promise<{ id: string; created: boolean } | null> {
  const existing = await findWorkspaceByClerkOrgId(prisma, org.id);
  if (existing) {
    const updated = await syncWorkspaceProfile(prisma, {
      clerkOrganizationId: org.id,
      name: org.name,
      syncedAt: new Date(org.updatedAt),
    });
    return updated ? { id: updated.id, created: false } : null;
  }

  if (!org.createdBy) {
    logger.warn(
      { clerkOrganizationId: org.id },
      "reconciliation found an organization with no local workspace and no created_by — cannot safely assign an owner",
    );
    await recordAuditEvent(prisma, {
      workspaceId: null,
      actorType: "RECONCILIATION",
      actorId: "clerk-reconciliation",
      eventType: "workspace.reconciliation_skipped",
      resourceType: "organization",
      resourceId: org.id,
      action: "create",
      outcome: "FAILURE",
      correlationId,
      metadata: { clerkOrganizationId: org.id, reason: "organization has no created_by" },
    });
    return null;
  }

  const result = await syncOrganizationCreated(prisma, {
    clerkOrganizationId: org.id,
    name: org.name,
    createdByClerkUserId: org.createdBy,
    updatedAt: new Date(org.updatedAt),
    correlationId,
  });
  return { id: result.workspace.id, created: result.created };
}

function primaryEmail(user: User): string | null {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

function displayName(user: User): string | null {
  const parts = [user.firstName, user.lastName].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : (user.username ?? null);
}

async function* paginate<T>(
  fetchPage: (offset: number) => Promise<{ data: T[]; totalCount: number }>,
): AsyncGenerator<T> {
  let offset = 0;
  for (;;) {
    const page = await fetchPage(offset);
    for (const item of page.data) yield item;
    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.totalCount) return;
  }
}
