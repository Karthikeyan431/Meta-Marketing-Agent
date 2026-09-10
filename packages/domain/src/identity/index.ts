export { OwnerInvariantError, MembershipNotFoundError, DeferredSyncError } from "./errors.js";

export {
  findUserByClerkId,
  findUserById,
  provisionUser,
  syncUserProfile,
  softDeleteUser,
  type ProvisionUserInput,
  type SyncUserProfileInput,
} from "./users.js";

export {
  findWorkspaceByClerkOrgId,
  findWorkspaceById,
  createWorkspaceWithOwner,
  syncWorkspaceProfile,
  markWorkspaceDeleted,
  type CreateWorkspaceWithOwnerInput,
  type CreateWorkspaceWithOwnerResult,
  type SyncWorkspaceProfileInput,
} from "./workspaces.js";

export {
  findMembership,
  findMembershipById,
  listActiveMembershipsForUser,
  listActiveMembershipsForWorkspace,
  removeMembership,
  changeMembershipRole,
  transferOwnership,
  upsertMembershipFromSync,
  removeMembershipFromSync,
  type MembershipWithWorkspace,
  type MembershipWithUser,
  type RemoveMembershipInput,
  type ChangeMembershipRoleInput,
  type TransferOwnershipInput,
  type UpsertMembershipFromSyncInput,
  type RemoveMembershipFromSyncInput,
} from "./memberships.js";

export { recordAuditEvent, type RecordAuditEventInput } from "./audit.js";

export {
  syncUserCreatedOrUpdated,
  syncUserDeleted,
  syncOrganizationCreated,
  syncOrganizationUpdated,
  syncOrganizationDeleted,
  syncMembershipUpsert,
  syncMembershipRemoved,
  type ClerkUserSyncInput,
  type ClerkUserDeletedInput,
  type ClerkOrganizationSyncInput,
  type ClerkOrganizationDeletedInput,
  type ClerkMembershipSyncInput,
  type ClerkMembershipRemovedInput,
} from "./sync.js";
