import type { FastifyInstance } from "fastify";
import {
  listWorkspacesResponseSchema,
  switchWorkspaceResponseSchema,
  successEnvelope,
  type WorkspaceSummary,
} from "@ai-marketing-manager/contracts";
import { getPrismaClient, listActiveMembershipsForUser } from "@ai-marketing-manager/domain";
import { requireAuth, requireWorkspaceMembership } from "../plugins/authorization.js";

/**
 * Minimum workspace API surface for Phase 2.3 (identity-api-contracts.md §2). Deliberately
 * excludes workspace create/update/delete/member-management CRUD — those are Phase 2.4+
 * scope once resource ownership beyond identity itself exists to manage; workspace
 * creation in particular is sync-driven only in Phase 2.3 (see
 * docs/identity/phase-2-3-implementation-report.md).
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
}
