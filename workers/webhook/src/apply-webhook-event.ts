import type {
  DeletedObjectJSON,
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserDeletedJSON,
  UserJSON,
} from "@clerk/backend";
import {
  syncMembershipRemoved,
  syncMembershipUpsert,
  syncOrganizationCreated,
  syncOrganizationDeleted,
  syncOrganizationUpdated,
  syncUserCreatedOrUpdated,
  syncUserDeleted,
  type PrismaClient,
} from "@ai-marketing-manager/domain";
import type { ClerkWebhookEventPayload } from "@ai-marketing-manager/queue";

export type ApplyResult = { outcome: "applied" } | { outcome: "ignored"; reason: string };

/**
 * Dispatches one verified Clerk webhook event to the appropriate identity/domain sync
 * function (identity-sync.md §1's event table). Unknown/unhandled event types are ignored
 * (logged, not an error) — reconciliation (identity-sync.md §4) is the backstop for
 * anything this deliberately narrow event set doesn't cover.
 *
 * Throws `DeferredSyncError` (propagated from packages/domain) when an event's "parent"
 * doesn't exist locally yet — the caller (processor.ts) lets that throw reach BullMQ so its
 * own retry/backoff handles the deferral (identity-sync.md §3).
 */
export async function applyWebhookEvent(
  prisma: PrismaClient,
  payload: ClerkWebhookEventPayload,
): Promise<ApplyResult> {
  const correlationId = payload.correlationId ?? null;

  switch (payload.eventType) {
    case "user.created":
    case "user.updated": {
      const data = payload.data as UserJSON;
      await syncUserCreatedOrUpdated(prisma, {
        clerkUserId: data.id,
        email: primaryEmail(data),
        displayName: displayName(data),
        updatedAt: new Date(data.updated_at),
      });
      return { outcome: "applied" };
    }

    case "user.deleted": {
      const data = payload.data as UserDeletedJSON;
      if (!data.id) return { outcome: "ignored", reason: "user.deleted carried no id" };
      await syncUserDeleted(prisma, { clerkUserId: data.id });
      return { outcome: "applied" };
    }

    case "organization.created": {
      const data = payload.data as OrganizationJSON;
      await syncOrganizationCreated(prisma, {
        clerkOrganizationId: data.id,
        name: data.name,
        createdByClerkUserId: data.created_by ?? null,
        updatedAt: new Date(data.updated_at),
        correlationId,
      });
      return { outcome: "applied" };
    }

    case "organization.updated": {
      const data = payload.data as OrganizationJSON;
      await syncOrganizationUpdated(prisma, {
        clerkOrganizationId: data.id,
        name: data.name,
        createdByClerkUserId: data.created_by ?? null,
        updatedAt: new Date(data.updated_at),
        correlationId,
      });
      return { outcome: "applied" };
    }

    case "organization.deleted": {
      const data = payload.data as DeletedObjectJSON;
      if (!data.id) return { outcome: "ignored", reason: "organization.deleted carried no id" };
      await syncOrganizationDeleted(prisma, { clerkOrganizationId: data.id, correlationId });
      return { outcome: "applied" };
    }

    // Treated identically (see phase-2-3-implementation-report.md): Clerk's
    // OrganizationMembershipJSON carries no distinguishable status field beyond the event
    // firing at all, so both converge on "ensure an ACTIVE membership row exists."
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const data = payload.data as OrganizationMembershipJSON;
      await syncMembershipUpsert(prisma, {
        clerkOrganizationId: data.organization.id,
        clerkUserId: data.public_user_data.user_id,
        updatedAt: new Date(data.updated_at),
      });
      return { outcome: "applied" };
    }

    case "organizationMembership.deleted": {
      const data = payload.data as OrganizationMembershipJSON;
      await syncMembershipRemoved(prisma, {
        clerkOrganizationId: data.organization.id,
        clerkUserId: data.public_user_data.user_id,
        updatedAt: new Date(data.updated_at),
        correlationId,
      });
      return { outcome: "applied" };
    }

    // organizationInvitation.* — informational mirroring only per identity-sync.md §1; no
    // invitation UI exists yet in Phase 2.3, so there is nothing to persist.
    // session.* — never synced (identity-sync.md §1); Clerk is the sole source of session
    // validity.
    default:
      return { outcome: "ignored", reason: `unhandled event type "${payload.eventType}"` };
  }
}

function primaryEmail(user: UserJSON): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}

function displayName(user: UserJSON): string | null {
  const parts = [user.first_name, user.last_name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : (user.username ?? null);
}
