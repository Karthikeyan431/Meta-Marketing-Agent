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
