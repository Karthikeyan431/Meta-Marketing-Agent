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
