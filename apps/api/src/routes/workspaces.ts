import type { FastifyInstance } from "fastify";
import { createClerkClient, type ClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import {
  listWorkspacesResponseSchema,
  switchWorkspaceResponseSchema,
  changeMembershipRoleRequestSchema,
  changeMembershipRoleResponseSchema,
  removeMembershipResponseSchema,
  transferOwnershipRequestSchema,
  transferOwnershipResponseSchema,
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  successEnvelope,
  errorEnvelope,
  type WorkspaceSummary,
  type MembershipSummary,
} from "@ai-marketing-manager/contracts";
import {
  getPrismaClient,
  listActiveMembershipsForUser,
  findMembershipById,
  changeMembershipRole,
  removeMembership,
  transferOwnership,
  recordAuditEvent,
  type WorkspaceMembership,
} from "@ai-marketing-manager/domain";
import {
  requireAuth,
  requireWorkspaceMembership,
  requirePermission,
  requireResourceAccess,
  mapMembershipMutationError,
} from "../plugins/authorization.js";
import { validateBody } from "../plugins/validation.js";
import type { ApiEnv } from "../env.js";

export interface WorkspacesRouteOptions {
  env: ApiEnv;
}

function toMembershipSummary(membership: WorkspaceMembership): MembershipSummary {
  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
  };
}

let clerkClientSingleton: ClerkClient | undefined;
/** Constructed once, lazily — mirrors `workers/webhook`'s `createClerkClient` pattern.
 *  `undefined` when `CLERK_SECRET_KEY` is absent (this repo's own CI, per the Hard
 *  Restriction against real Clerk keys in CI); callers must handle that case explicitly. */
function getClerkClient(env: ApiEnv): ClerkClient | undefined {
  if (!env.CLERK_SECRET_KEY) return undefined;
  clerkClientSingleton ??= createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  return clerkClientSingleton;
}

/**
 * Fixed, non-authoritative Clerk Organization role passed to every invitation —
 * `createOrganizationInvitation()` requires a Clerk-side role, but this project's own RBAC
 * (`rbac.md`) is modeled entirely in our own database and never derived from Clerk's role
 * feature (`clerk-integration.md`: "do not use Clerk's admin/member roles as our application
 * RBAC"). `org:member` (Clerk's least-privileged built-in role) is used uniformly regardless
 * of any intended application role — never mapped or varied — so this value carries zero
 * authorization weight in this system.
 */
const CLERK_INVITATION_ROLE = "org:member";

/**
 * Workspace API surface. Member-management (Phase 2.5, `identity-api-contracts.md` §2,
 * `phase-2-implementation-sequence.md` §4) wraps the already-tested Phase 2.3/2.4 domain
 * mutation functions (`changeMembershipRole()`/`removeMembership()`/`transferOwnership()`)
 * — no authorization logic is duplicated here, only the HTTP chain
 * `requireAuth → requireWorkspaceMembership → requirePermission → requireResourceAccess`
 * that hands off to them. The invite route (below) is the sole exception to "wraps a domain
 * function" — it calls Clerk's Organization Invitation API directly and creates no local
 * row; see its own doc comment. Excludes workspace create/update/delete — those remain
 * sync-driven only (Phase 2.3) / undecided.
 */
export default async function workspacesRoute(app: FastifyInstance, opts: WorkspacesRouteOptions) {
  app.get("/workspaces", async (request, reply) => {
    const user = await requireAuth(request);
    const prisma = getPrismaClient();
    const memberships = await listActiveMembershipsForUser(prisma, user.id);

    const workspaces: WorkspaceSummary[] = memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      status: membership.workspace.status as WorkspaceSummary["status"],
      role: membership.role as WorkspaceSummary["role"],
    }));

    const body = listWorkspacesResponseSchema.parse({ workspaces });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });

  /**
   * workspace-model.md §4's switching flow: re-verifies membership against the database —
   * the browser-supplied `:id` carries no authorization weight on its own. This endpoint
   * does not itself hold session state (Clerk's own active-organization context is the
   * mechanism — ADR-024); it is the server-side authorization gate the client calls before
   * invoking Clerk's own `setActive({ organization })`, so an unauthorized switch is
   * rejected before the client ever asks Clerk to change its active organization.
   */
  app.post<{ Params: { id: string } }>("/workspaces/:id/switch", async (request, reply) => {
    const user = await requireAuth(request);
    const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);

    const body = switchWorkspaceResponseSchema.parse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        role: membership.role,
      },
    });
    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });

  /**
   * Role change (`identity-api-contracts.md` §2, `rbac.md` §8.2). `requirePermission` is the
   * coarse gate (MANAGER/ANALYST/VIEWER rejected before any role-comparison logic runs —
   * test-matrix E3); `requireResourceAccess` confirms `:membershipId` actually belongs to
   * `:id` (never trusted from the path alone — test-matrix E5/W2/W3's spoof-coverage
   * pattern) before `changeMembershipRole()`'s own domain-layer checks (self-mutation,
   * OWNER-assignment, owner-invariant — all re-verified fresh inside its transaction,
   * never trusting this route's checks as sufficient on their own, per ADR-028).
   */
  app.patch<{ Params: { id: string; membershipId: string } }>(
    "/workspaces/:id/members/:membershipId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "members.update");

      const body = await validateBody(changeMembershipRoleRequestSchema, request, reply);
      if (body === undefined) return;

      const prisma = getPrismaClient();
      const target = await findMembershipById(prisma, request.params.membershipId);
      requireResourceAccess(target, workspace.id);

      try {
        const updated = await changeMembershipRole(prisma, {
          membershipId: request.params.membershipId,
          workspaceId: workspace.id,
          newRole: body.newRole,
          actorUserId: user.id,
          correlationId: request.requestId,
        });
        const responseBody = changeMembershipRoleResponseSchema.parse({
          membership: toMembershipSummary(updated),
        });
        reply.code(200).send(successEnvelope(responseBody, { requestId: request.requestId }));
      } catch (error) {
        mapMembershipMutationError(error);
      }
    },
  );

  /**
   * Removal (`identity-api-contracts.md` §2). Self-removal ("leaving a workspace") is
   * allowed regardless of role via this same route — `removeMembership()`'s own logic
   * distinguishes removing oneself from removing another member (rbac.md §8.2 rule 2); the
   * owner invariant (never zero active OWNERs) is enforced inside the domain call either way.
   */
  app.delete<{ Params: { id: string; membershipId: string } }>(
    "/workspaces/:id/members/:membershipId",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);

      const prisma = getPrismaClient();
      const target = await findMembershipById(prisma, request.params.membershipId);
      const targetMembership = requireResourceAccess(target, workspace.id);

      if (targetMembership.userId !== user.id) {
        requirePermission(membership, "members.remove");
      }

      try {
        const removed = await removeMembership(prisma, {
          membershipId: request.params.membershipId,
          workspaceId: workspace.id,
          actorUserId: user.id,
          correlationId: request.requestId,
        });
        const responseBody = removeMembershipResponseSchema.parse({
          membership: toMembershipSummary(removed),
        });
        reply.code(200).send(successEnvelope(responseBody, { requestId: request.requestId }));
      } catch (error) {
        mapMembershipMutationError(error);
      }
    },
  );

  /**
   * Ownership transfer (`phase-2-implementation-sequence.md` §4 step 3, `rbac.md` §8.2 rule
   * 4). `fromMembershipId` is never accepted as client input — it is always the caller's own,
   * already-authorized membership, so a caller can never even attempt to name someone else's
   * membership as the outgoing owner (defense-in-depth ahead of `transferOwnership()`'s own
   * `actorUserId` check).
   */
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/ownership-transfer",
    async (request, reply) => {
      const user = await requireAuth(request);
      const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
      requirePermission(membership, "members.update");

      const body = await validateBody(transferOwnershipRequestSchema, request, reply);
      if (body === undefined) return;

      const prisma = getPrismaClient();
      try {
        const result = await transferOwnership(prisma, {
          workspaceId: workspace.id,
          fromMembershipId: membership.id,
          toMembershipId: body.toMembershipId,
          actorUserId: user.id,
          correlationId: request.requestId,
        });
        const responseBody = transferOwnershipResponseSchema.parse({
          from: toMembershipSummary(result.from),
          to: toMembershipSummary(result.to),
        });
        reply.code(200).send(successEnvelope(responseBody, { requestId: request.requestId }));
      } catch (error) {
        mapMembershipMutationError(error);
      }
    },
  );

  /**
   * Invitation via Clerk's Organization Invitation API (Phase 2.5, `phase-2-5-
   * implementation-report.md` §2). **Creates no local `workspace_membership` row.** Clerk
   * remains the sole invitation-delivery/state mechanism (`clerk-integration.md`); the
   * local membership appears only once the invitee accepts and the existing
   * webhook/reconciliation pipeline observes the resulting `organizationMembership.created`
   * event (`upsertMembershipFromSync()`, unchanged) — at VIEWER, exactly like every other
   * new membership, since role is never taken from a Clerk event. Never accepts a role in
   * the request body; never derives the Clerk Organization ID from anything but the
   * server-resolved `Workspace` row (never client input).
   */
  app.post<{ Params: { id: string } }>("/workspaces/:id/members/invite", async (request, reply) => {
    const user = await requireAuth(request);
    const { workspace, membership } = await requireWorkspaceMembership(user, request.params.id);
    requirePermission(membership, "members.invite");

    const body = await validateBody(inviteMemberRequestSchema, request, reply);
    if (body === undefined) return;

    const clerkClient = getClerkClient(opts.env);
    if (!clerkClient || !workspace.clerkOrganizationId) {
      reply
        .code(503)
        .send(
          errorEnvelope(
            "PROVIDER_UNAVAILABLE",
            "Invitations are not available for this workspace.",
            request.requestId,
          ),
        );
      return;
    }

    let invitation;
    try {
      invitation = await clerkClient.organizations.createOrganizationInvitation({
        organizationId: workspace.clerkOrganizationId,
        emailAddress: body.emailAddress,
        role: CLERK_INVITATION_ROLE,
        inviterUserId: user.clerkUserId,
      });
    } catch (error) {
      // Never log/return Clerk's raw error object (may carry request metadata) — only its
      // code, and only server-side. A 4xx from Clerk (e.g. already invited, already a
      // member) is a well-formed, authorized request conflicting with existing state —
      // the same 409 convention as the owner invariant (F5); anything else (network,
      // misconfiguration, Clerk outage) is 503, matching webhooks-clerk.ts's precedent.
      if (isClerkAPIResponseError(error) && error.status >= 400 && error.status < 500) {
        request.log.warn(
          { requestId: request.requestId, clerkErrorCodes: error.errors.map((e) => e.code) },
          "organization invitation rejected by Clerk",
        );
        reply
          .code(409)
          .send(
            errorEnvelope(
              "CONFLICT",
              "This person may already be invited or a member of this workspace.",
              request.requestId,
            ),
          );
        return;
      }
      request.log.error(
        { requestId: request.requestId },
        "organization invitation failed (Clerk API error)",
      );
      reply
        .code(503)
        .send(
          errorEnvelope(
            "PROVIDER_UNAVAILABLE",
            "Invitations are temporarily unavailable.",
            request.requestId,
          ),
        );
      return;
    }

    await recordAuditEvent(getPrismaClient(), {
      workspaceId: workspace.id,
      actorType: "USER",
      actorId: user.id,
      eventType: "workspace.member_invited",
      resourceType: "organization_invitation",
      resourceId: invitation.id,
      action: "invite",
      outcome: "SUCCESS",
      correlationId: request.requestId,
    });

    const responseBody = inviteMemberResponseSchema.parse({
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        status: invitation.status ?? "pending",
      },
    });
    reply.code(201).send(successEnvelope(responseBody, { requestId: request.requestId }));
  });
}
