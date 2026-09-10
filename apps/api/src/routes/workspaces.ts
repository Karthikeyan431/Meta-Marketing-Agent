import type { FastifyInstance } from "fastify";
import {
  listWorkspacesResponseSchema,
  switchWorkspaceResponseSchema,
  changeMembershipRoleRequestSchema,
  changeMembershipRoleResponseSchema,
  removeMembershipResponseSchema,
  transferOwnershipRequestSchema,
  transferOwnershipResponseSchema,
  successEnvelope,
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

function toMembershipSummary(membership: WorkspaceMembership): MembershipSummary {
  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
  };
}

/**
 * Workspace API surface. Member-management (Phase 2.5, `identity-api-contracts.md` §2,
 * `phase-2-implementation-sequence.md` §4) wraps the already-tested Phase 2.3/2.4 domain
 * mutation functions (`changeMembershipRole()`/`removeMembership()`/`transferOwnership()`)
 * — no authorization logic is duplicated here, only the HTTP chain
 * `requireAuth → requireWorkspaceMembership → requirePermission → requireResourceAccess`
 * that hands off to them. Deliberately excludes `POST /workspaces/:id/members/invite` —
 * see `phase-2-5-implementation-report.md` §3 (blocked pending an owner decision on the
 * actual invitation mechanism; Clerk Organizations own invite lifecycle, per
 * `clerk-integration.md`, and no Clerk Organization Invitation API integration exists in
 * this codebase). Also excludes workspace create/update/delete — those remain sync-driven
 * only (Phase 2.3) / undecided.
 */
export default async function workspacesRoute(app: FastifyInstance) {
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
}
