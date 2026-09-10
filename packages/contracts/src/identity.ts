import { z } from "zod";

/** rbac.md §1 — the fixed, application-owned role set. Never a Clerk Organization role. */
export const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "ANALYST", "VIEWER"]);
export type RoleContract = z.infer<typeof roleSchema>;

export const workspaceStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "DELETED"]);
export type WorkspaceStatusContract = z.infer<typeof workspaceStatusSchema>;

/** A workspace summary as returned to a member — never leaks the internal Clerk
 *  Organization ID or any other workspace's data (Step 8's "do not expose internal IDs
 *  where the contract doesn't require them"). */
export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: workspaceStatusSchema,
  role: roleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

/**
 * Phase 2.3: the authenticated Clerk identity PLUS the resolved Application User,
 * membership list, and (if unambiguously resolvable — workspace-model.md §3) the active
 * workspace. `activeWorkspace: null` with `memberships.length > 1` means the caller must
 * make an explicit selection (`POST /workspaces/:id/switch`); the server never guesses.
 */
export const meResponseSchema = z.object({
  userId: z.string(),
  user: z.object({ id: z.string() }),
  memberships: z.array(workspaceSummarySchema),
  activeWorkspace: workspaceSummarySchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const listWorkspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSummarySchema),
});
export type ListWorkspacesResponse = z.infer<typeof listWorkspacesResponseSchema>;

export const switchWorkspaceResponseSchema = z.object({
  workspace: workspaceSummarySchema,
});
export type SwitchWorkspaceResponse = z.infer<typeof switchWorkspaceResponseSchema>;

/** Phase 2.5 — member-management API surface (identity-api-contracts.md §2,
 *  phase-2-implementation-sequence.md §4). */
export const membershipStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]);
export type MembershipStatusContract = z.infer<typeof membershipStatusSchema>;

/** A membership as returned to an authorized member-management caller — never leaks another
 *  workspace's data (requireResourceAccess already confirms `:membershipId` belongs to
 *  `:id` before this is ever built). */
export const membershipSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: roleSchema,
  status: membershipStatusSchema,
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const changeMembershipRoleRequestSchema = z.object({
  newRole: roleSchema,
});
export type ChangeMembershipRoleRequest = z.infer<typeof changeMembershipRoleRequestSchema>;

export const changeMembershipRoleResponseSchema = z.object({
  membership: membershipSummarySchema,
});
export type ChangeMembershipRoleResponse = z.infer<typeof changeMembershipRoleResponseSchema>;

export const removeMembershipResponseSchema = z.object({
  membership: membershipSummarySchema,
});
export type RemoveMembershipResponse = z.infer<typeof removeMembershipResponseSchema>;

/** `toMembershipId` only — the outgoing owner (`fromMembershipId`) is always the caller's
 *  own membership, resolved server-side from the authenticated session, never accepted as
 *  client input (closes the "client names someone else's fromMembershipId" spoof vector
 *  before it can even reach transferOwnership()'s own actorUserId check). */
export const transferOwnershipRequestSchema = z.object({
  toMembershipId: z.string(),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;

export const transferOwnershipResponseSchema = z.object({
  from: membershipSummarySchema,
  to: membershipSummarySchema,
});
export type TransferOwnershipResponse = z.infer<typeof transferOwnershipResponseSchema>;
