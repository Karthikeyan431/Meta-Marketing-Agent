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
