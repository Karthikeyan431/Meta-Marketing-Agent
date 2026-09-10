/** No `MetaConnection` row exists for this workspace — the caller decides the HTTP status
 *  (404 for a resource-access check, 409 for an operation that requires an existing
 *  connection). */
export class MetaConnectionNotFoundError extends Error {
  code = "META_CONNECTION_NOT_FOUND";

  constructor(message = "No Meta connection exists for this workspace.") {
    super(message);
    this.name = "MetaConnectionNotFoundError";
  }
}

/** A workspace already holds an active (non-`DISCONNECTED`) Meta connection — reconnection
 *  must update the existing row (meta-connection-model.md §4), not create a second one; this
 *  error signals an internal invariant violation, not a normal client-facing state. */
export class MetaConnectionAlreadyActiveError extends Error {
  code = "META_CONNECTION_ALREADY_ACTIVE";

  constructor(message = "This workspace already has an active Meta connection.") {
    super(message);
    this.name = "MetaConnectionAlreadyActiveError";
  }
}

/** No `AdAccount` row exists for this internal ID within this workspace (meta-resource-
 *  model.md §1-2's workspace-scoped lookup — never a global ID lookup). The caller maps this
 *  to 404, matching `authorization.md` §3's resource-enumeration policy. */
export class AdAccountNotFoundError extends Error {
  code = "AD_ACCOUNT_NOT_FOUND";

  constructor(message = "No ad account exists for this workspace.") {
    super(message);
    this.name = "AdAccountNotFoundError";
  }
}

/** One or more requested external Meta ad-account IDs were not present in a fresh discovery
 *  call through the workspace's own authorized connection (meta-threat-model.md #7's
 *  "malicious/foreign external ID" defense, applied to selection). */
export class AdAccountNotDiscoverableError extends Error {
  code = "AD_ACCOUNT_NOT_DISCOVERABLE";
  readonly externalIds: readonly string[];

  constructor(externalIds: readonly string[]) {
    super("One or more requested ad accounts were not found via the authorized connection.");
    this.name = "AdAccountNotDiscoverableError";
    this.externalIds = externalIds;
  }
}
