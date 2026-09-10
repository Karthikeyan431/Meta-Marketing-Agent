export {
  getPrismaClient,
  checkDatabaseHealth,
  disconnectDatabase,
  type DbHealthResult,
} from "./db.js";

export { isUniqueConstraintViolation } from "./prisma-errors.js";

export {
  ROLES,
  PERMISSION_CATALOG,
  roleHasPermission,
  type RoleName,
  type PermissionDefinition,
  type PermissionKey,
} from "./rbac-catalog.js";

export * from "./identity/index.js";
export * from "./meta/index.js";

// Re-exported so consumers (apps/api, workers/webhook) never need a direct @prisma/client
// dependency of their own just to name these types.
export type {
  PrismaClient,
  User,
  Workspace,
  WorkspaceMembership,
  Permission,
  RolePermission,
  AuditEvent,
  ClerkWebhookEvent,
  Role,
  WorkspaceStatus,
  MembershipStatus,
  AuditActorType,
  AuditOutcome,
  WebhookEventStatus,
  MetaConnection,
  MetaConnectionStatus,
} from "@prisma/client";
