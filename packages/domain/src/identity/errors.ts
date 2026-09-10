/** Thrown when an application-initiated mutation would leave a workspace with zero OWNERs
 *  (workspace-model.md §5, ADR-020) — mapped to 409 CONFLICT by apps/api. */
export class OwnerInvariantError extends Error {
  code = "OWNER_INVARIANT_VIOLATION";

  constructor(message: string) {
    super(message);
    this.name = "OwnerInvariantError";
  }
}

/** A referenced membership does not exist, does not belong to the claimed workspace, or is
 *  not active — the caller decides the HTTP status (404 for resource access, 409 for a
 *  stale mutation target). */
export class MembershipNotFoundError extends Error {
  code = "MEMBERSHIP_NOT_FOUND";

  constructor(message = "Membership not found.") {
    super(message);
    this.name = "MembershipNotFoundError";
  }
}

/**
 * The acting user does not hold sufficient role authority for a role/membership mutation —
 * either they hold no active membership in the workspace at all, or their role is not
 * OWNER/ADMIN (rbac.md §8.1's "members.invite/update/remove are held by OWNER and ADMIN
 * only"). Distinct from `AuthorizationError`/`403` at the API layer — this is the domain
 * layer's own, defense-in-depth check, re-derived fresh inside the mutation's transaction
 * rather than trusting that an API-layer permission check already ran (Phase 2.4A, ADR-028).
 */
export class InsufficientRoleAuthorityError extends Error {
  code = "INSUFFICIENT_ROLE_AUTHORITY";

  constructor(message = "Actor does not have sufficient role authority for this operation.") {
    super(message);
    this.name = "InsufficientRoleAuthorityError";
  }
}

/** A membership can never change its own role — rbac.md §8.2 rule 3. Self-service role
 *  escalation (or self-demotion) is blocked unconditionally, regardless of what role the
 *  actor already holds. */
export class SelfRoleMutationError extends Error {
  code = "SELF_ROLE_MUTATION_NOT_ALLOWED";

  constructor(message = "A membership cannot change its own role.") {
    super(message);
    this.name = "SelfRoleMutationError";
  }
}

/** OWNER can only ever be assigned via `transferOwnership()`'s atomic swap — rbac.md §8.2
 *  rule 1 / ADR-028. `changeMembershipRole()` rejects `newRole: "OWNER"` unconditionally,
 *  for every caller, with no exception. */
export class OwnerAssignmentNotAllowedError extends Error {
  code = "OWNER_ASSIGNMENT_NOT_ALLOWED";

  constructor(message = "OWNER can only be assigned via transferOwnership().") {
    super(message);
    this.name = "OwnerAssignmentNotAllowedError";
  }
}

/**
 * Thrown by sync handlers (identity/sync.ts) when an event's "parent" (the Workspace or
 * User a membership event refers to) does not exist locally yet — identity-sync.md §3:
 * "each handler is written to tolerate its 'parent' not yet existing locally by deferring
 * ... rather than failing hard." The webhook worker lets BullMQ's own retry/backoff handle
 * this; reconciliation is the eventual backstop if retries are exhausted.
 */
export class DeferredSyncError extends Error {
  code = "DEFERRED_SYNC";

  constructor(message: string) {
    super(message);
    this.name = "DeferredSyncError";
  }
}
