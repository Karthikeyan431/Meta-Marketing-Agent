/**
 * Single source of truth for the role→permission matrix — docs/identity/rbac.md §3.
 *
 * This is deliberately DATA, not a switch/if-chain (identity-data-model.md §1's "enum for
 * the small, stable role set; relational for the permission catalog" reasoning). The seed
 * script (prisma/seed.ts) mirrors this exact catalog into the `permissions`/
 * `role_permissions` tables so it can be queried/audited as data; `roleHasPermission()`
 * below is the fast in-process check every `requirePermission()` call uses, backed by this
 * same array so the two can never drift — see rbac-catalog.test.ts, which asserts the
 * seeded DB rows equal this catalog exactly.
 *
 * Editing the role list for any permission here is an RBAC policy change — it must trace
 * back to an update in docs/identity/rbac.md §3 first, never the other way around.
 */

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "ANALYST", "VIEWER"] as const;
export type RoleName = (typeof ROLES)[number];

export interface PermissionDefinition {
  key: string;
  resourceGroup: string;
  roles: readonly RoleName[];
}

const OWNER_ADMIN = ["OWNER", "ADMIN"] as const;
const ALL_ROLES = ROLES;
const READ_ROLES = ["OWNER", "ADMIN", "MANAGER", "ANALYST"] as const;
const MANAGE_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // Workspace — rbac.md §3 "Workspace"
  { key: "workspace.read", resourceGroup: "workspace", roles: ALL_ROLES },
  { key: "workspace.update", resourceGroup: "workspace", roles: OWNER_ADMIN },
  { key: "workspace.delete", resourceGroup: "workspace", roles: ["OWNER"] },
  { key: "members.read", resourceGroup: "workspace", roles: ALL_ROLES },
  { key: "members.invite", resourceGroup: "workspace", roles: OWNER_ADMIN },
  { key: "members.update", resourceGroup: "workspace", roles: OWNER_ADMIN },
  { key: "members.remove", resourceGroup: "workspace", roles: OWNER_ADMIN },

  // Meta Connections — rbac.md §3 "Meta Connections"
  { key: "meta_connection.read", resourceGroup: "meta_connection", roles: ALL_ROLES },
  { key: "meta_connection.connect", resourceGroup: "meta_connection", roles: OWNER_ADMIN },
  { key: "meta_connection.reconnect", resourceGroup: "meta_connection", roles: OWNER_ADMIN },
  { key: "meta_connection.disconnect", resourceGroup: "meta_connection", roles: OWNER_ADMIN },

  // Campaigns — rbac.md §3 "Campaigns"
  { key: "campaign.read", resourceGroup: "campaign", roles: ALL_ROLES },
  { key: "campaign.create", resourceGroup: "campaign", roles: MANAGE_ROLES },
  { key: "campaign.update", resourceGroup: "campaign", roles: MANAGE_ROLES },
  { key: "campaign.pause", resourceGroup: "campaign", roles: MANAGE_ROLES },
  { key: "campaign.delete", resourceGroup: "campaign", roles: OWNER_ADMIN },

  // Reporting — rbac.md §3 "Reporting"
  { key: "report.read", resourceGroup: "report", roles: ALL_ROLES },
  { key: "report.create", resourceGroup: "report", roles: READ_ROLES },
  { key: "report.export", resourceGroup: "report", roles: READ_ROLES },

  // AI — rbac.md §3 "AI". ai.execute deliberately narrower than campaign.update (§4).
  { key: "ai.read", resourceGroup: "ai", roles: ALL_ROLES },
  { key: "ai.chat", resourceGroup: "ai", roles: READ_ROLES },
  { key: "ai.propose", resourceGroup: "ai", roles: MANAGE_ROLES },
  { key: "ai.execute", resourceGroup: "ai", roles: OWNER_ADMIN },

  // Financial Actions — rbac.md §3/§4. Never implied by campaign.*/ai.* permissions.
  { key: "budget.read", resourceGroup: "budget", roles: READ_ROLES },
  { key: "budget.propose", resourceGroup: "budget", roles: MANAGE_ROLES },
  { key: "budget.approve", resourceGroup: "budget", roles: OWNER_ADMIN },
  { key: "budget.execute", resourceGroup: "budget", roles: OWNER_ADMIN },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

const ROLE_PERMISSION_INDEX: ReadonlyMap<RoleName, ReadonlySet<string>> = new Map(
  ROLES.map((role) => [
    role,
    new Set(PERMISSION_CATALOG.filter((p) => p.roles.includes(role)).map((p) => p.key)),
  ]),
);

/**
 * The in-process form of `requirePermission()`'s check (authorization.md §1) — no DB round
 * trip per call, backed by the same catalog seeded into the database. Never grants a
 * permission because a related one is held (rbac.md §4's financial separation rule is just
 * an emergent property of this catalog having no such implication encoded).
 */
export function roleHasPermission(role: RoleName, permission: string): boolean {
  return ROLE_PERMISSION_INDEX.get(role)?.has(permission) ?? false;
}
