import type { FastifyRequest } from "fastify";
import {
  getPrismaClient,
  provisionUser,
  findWorkspaceByClerkOrgId,
  findWorkspaceById,
  findMembership,
  listActiveMembershipsForUser,
  roleHasPermission,
  MembershipNotFoundError,
  InsufficientRoleAuthorityError,
  SelfRoleMutationError,
  OwnerAssignmentNotAllowedError,
  OwnerInvariantError,
  type MembershipWithWorkspace,
  type RoleName,
  type Workspace,
  type WorkspaceMembership,
} from "@ai-marketing-manager/domain";
import { requireAuthenticatedIdentity } from "./auth.js";

/**
 * The authorization primitive chain (docs/identity/authorization.md §1). Each primitive
 * may only ever narrow what the next is allowed to see — none may widen access granted by
 * a previous one. Every failure throws an error carrying a Fastify-recognized
 * `statusCode`, mapped to the standard error envelope by plugins/error-handler.ts.
 */

export class AuthorizationError extends Error {
  statusCode = 403;
  code = "AUTHORIZATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ResourceNotFoundError extends Error {
  statusCode = 404;
  code = "NOT_FOUND";

  constructor(message = "Resource not found.") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = "CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export interface AuthenticatedApplicationUser {
  id: string;
  clerkUserId: string;
  /** The active-organization claim from the verified session token — see auth.ts. Never
   *  authorization-sufficient on its own; only ever an input to `requireWorkspace()`. */
  claimedOrgId: string | null;
}

/**
 * `requireAuth()` (authorization.md §1): confirms a valid Clerk session and resolves it to
 * our own `users` row, provisioning it on first contact (Phase 2.3 Step 3) — idempotent,
 * race-safe (see provisionUser). Creates no workspace context.
 */
export async function requireAuth(request: FastifyRequest): Promise<AuthenticatedApplicationUser> {
  const identity = requireAuthenticatedIdentity(request); // throws 401 AuthenticationRequiredError
  const prisma = getPrismaClient();
  const user = await provisionUser(prisma, { clerkUserId: identity.userId });
  return { id: user.id, clerkUserId: user.clerkUserId, claimedOrgId: identity.orgId };
}

export type ActiveWorkspaceResolution =
  | { status: "resolved"; workspace: Workspace; membership: WorkspaceMembership }
  /** The verified session claims an organization with no corresponding local workspace
   *  yet (not synced), or the user has zero memberships. */
  | { status: "none" }
  /** No organization is claimed and the user belongs to more than one workspace — the
   *  server does not guess (workspace-model.md §3 step 4); the caller must select. */
  | { status: "ambiguous"; memberships: MembershipWithWorkspace[] };

/**
 * The active-workspace resolution chain (workspace-model.md §3, ADR-024): verified Clerk
 * org-context claim → application membership → workspace status → authorized workspace.
 * Never throws — callers that need a hard requirement use `requireWorkspace()` below;
 * `GET /me` uses this directly to report a richer, non-error response.
 */
export async function resolveActiveWorkspace(
  user: AuthenticatedApplicationUser,
): Promise<ActiveWorkspaceResolution> {
  const prisma = getPrismaClient();

  if (user.claimedOrgId) {
    const workspace = await findWorkspaceByClerkOrgId(prisma, user.claimedOrgId);
    if (!workspace || workspace.status !== "ACTIVE") return { status: "none" };

    const membership = await findMembership(prisma, { userId: user.id, workspaceId: workspace.id });
    if (!membership || membership.status !== "ACTIVE") return { status: "none" };

    return { status: "resolved", workspace, membership };
  }

  const memberships = await listActiveMembershipsForUser(prisma, user.id);
  if (memberships.length === 0) return { status: "none" };
  if (memberships.length > 1) return { status: "ambiguous", memberships };

  const only = memberships[0];
  if (!only || only.workspace.status !== "ACTIVE") return { status: "none" };
  const workspace = await findWorkspaceById(prisma, only.workspaceId);
  if (!workspace) return { status: "none" };

  return { status: "resolved", workspace, membership: only };
}

/**
 * `requireWorkspace()` + `requireMembership()` combined (authorization.md §1): resolves and
 * authorizes the active workspace, or throws `403`. Ambiguity (multiple memberships, none
 * claimed) is also a `403` here — an endpoint that needs a single resolved workspace cannot
 * proceed without one; `GET /me` is the endpoint that surfaces the ambiguous case to the
 * client for explicit selection instead of erroring.
 */
export async function requireActiveWorkspace(
  user: AuthenticatedApplicationUser,
): Promise<{ workspace: Workspace; membership: WorkspaceMembership }> {
  const resolution = await resolveActiveWorkspace(user);
  if (resolution.status !== "resolved") {
    throw new AuthorizationError("No authorized active workspace for this request.");
  }
  return resolution;
}

/**
 * `requireWorkspace(workspaceId)` + `requireMembership()` for an explicitly path-addressed
 * workspace (identity-api-contracts.md's `GET /workspaces/:id`-shaped endpoints). The path
 * value is accepted as input, exactly per authorization.md §1 — it is never
 * authorization-sufficient on its own; membership is what actually authorizes it.
 */
export async function requireWorkspaceMembership(
  user: AuthenticatedApplicationUser,
  workspaceId: string,
): Promise<{ workspace: Workspace; membership: WorkspaceMembership }> {
  const prisma = getPrismaClient();

  const workspace = await findWorkspaceById(prisma, workspaceId);
  if (!workspace || workspace.status !== "ACTIVE") {
    throw new AuthorizationError("Not a member of this workspace.");
  }

  const membership = await findMembership(prisma, { userId: user.id, workspaceId: workspace.id });
  if (!membership || membership.status !== "ACTIVE") {
    throw new AuthorizationError("Not a member of this workspace.");
  }

  return { workspace, membership };
}

/**
 * `requirePermission()` (authorization.md §1, rbac.md §3): confirms the membership's role
 * grants the named permission. Never grants a permission because a related one is held
 * (rbac.md §4).
 */
export function requirePermission(membership: WorkspaceMembership, permission: string): void {
  if (!roleHasPermission(membership.role as RoleName, permission)) {
    throw new AuthorizationError(
      `Role ${membership.role} does not grant permission "${permission}".`,
    );
  }
}

/**
 * `requireResourceAccess()` (authorization.md §2/§3): the mechanical IDOR/BOLA rule —
 * resolve the resource AND confirm its `workspaceId` equals the authorized workspace's ID,
 * in the same query the repository already ran, never a separate "check after the fact."
 * A resource that exists but belongs to a different workspace is indistinguishable from one
 * that does not exist at all — always `404`, never `403` (authorization.md §3's
 * resource-enumeration policy).
 */
export function requireResourceAccess<T extends { workspaceId: string }>(
  resource: T | null,
  authorizedWorkspaceId: string,
): T {
  if (!resource || resource.workspaceId !== authorizedWorkspaceId) {
    throw new ResourceNotFoundError();
  }
  return resource;
}

/**
 * Maps domain-layer identity/membership errors (`packages/domain/src/identity/errors.ts`) to
 * the HTTP error classes above (Phase 2.5, `identity-api-contracts.md`/`phase-2-4a-test-
 * matrix.md` F5). Domain errors carry a `code` for audit/logging but no HTTP `statusCode` —
 * every route that calls `changeMembershipRole()`/`removeMembership()`/`transferOwnership()`
 * routes its catch block through this rather than each re-deriving the mapping. An
 * unrecognized error is rethrown unchanged (falls through to the 500 handler) rather than
 * silently reinterpreted — this function only ever narrows a known denial to its correct
 * status code, never invents one for an error it doesn't recognize.
 */
export function mapMembershipMutationError(error: unknown): never {
  if (error instanceof MembershipNotFoundError) {
    throw new ResourceNotFoundError(error.message);
  }
  if (
    error instanceof InsufficientRoleAuthorityError ||
    error instanceof SelfRoleMutationError ||
    error instanceof OwnerAssignmentNotAllowedError
  ) {
    throw new AuthorizationError(error.message);
  }
  if (error instanceof OwnerInvariantError) {
    throw new ConflictError(error.message);
  }
  throw error;
}
