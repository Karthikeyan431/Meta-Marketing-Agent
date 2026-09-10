import type { FastifyInstance } from "fastify";
import {
  meResponseSchema,
  successEnvelope,
  type WorkspaceSummary,
} from "@ai-marketing-manager/contracts";
import {
  getPrismaClient,
  listActiveMembershipsForUser,
  type MembershipWithWorkspace,
} from "@ai-marketing-manager/domain";
import { requireAuth, resolveActiveWorkspace } from "../plugins/authorization.js";

function toWorkspaceSummary(membership: MembershipWithWorkspace): WorkspaceSummary {
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    status: membership.workspace.status as WorkspaceSummary["status"],
    role: membership.role as WorkspaceSummary["role"],
  };
}

/**
 * Proves the full identity chain (Phase 2.3): verified Clerk identity → Application User
 * (provisioned on first contact) → memberships → active workspace resolution
 * (workspace-model.md §3). `activeWorkspace: null` with more than one membership means the
 * client must make an explicit selection via `POST /workspaces/:id/switch`.
 */
export default async function meRoute(app: FastifyInstance) {
  app.get("/me", async (request, reply) => {
    const user = await requireAuth(request);
    const prisma = getPrismaClient();

    const [memberships, resolution] = await Promise.all([
      listActiveMembershipsForUser(prisma, user.id),
      resolveActiveWorkspace(user),
    ]);

    const activeWorkspace: WorkspaceSummary | null =
      resolution.status === "resolved"
        ? {
            id: resolution.workspace.id,
            name: resolution.workspace.name,
            status: resolution.workspace.status,
            role: resolution.membership.role as WorkspaceSummary["role"],
          }
        : null;

    const body = meResponseSchema.parse({
      userId: user.clerkUserId,
      user: { id: user.id },
      memberships: memberships.map(toWorkspaceSummary),
      activeWorkspace,
    });

    reply.code(200).send(successEnvelope(body, { requestId: request.requestId }));
  });
}
