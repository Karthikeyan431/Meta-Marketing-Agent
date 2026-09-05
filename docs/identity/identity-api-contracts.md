# Identity API Contracts

**Document ID:** IDENT-011 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

Contracts only, per `API_CONTRACTS.md`'s (API-003) envelope conventions already
established in Phase 1 (`{data, meta}` / `{error: {code, message, requestId}}`). No route is
implemented in this phase.

## 1. Primitive Contracts (restated from `authorization.md` in request/response terms)

| Primitive                                                     | Input                                                                                             | Success                                 | Failure                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `requireAuth()`                                               | Request (Clerk session cookie)                                                                    | `AuthenticatedUser { id, clerkUserId }` | `401 { error: { code: "AUTHENTICATION_ERROR", ... } }`                          |
| `requireWorkspace(workspaceId)`                               | Server-resolved workspace ID (never a raw path param used directly — see `workspace-model.md` §3) | `Workspace { id, status, ... }`         | `403` (or `404` if resource-enumeration policy applies — `authorization.md` §3) |
| `requireMembership(user, workspaceId)`                        | User + workspace from above                                                                       | `Membership { role, status }`           | `403`                                                                           |
| `requirePermission(membership, permission)`                   | Membership + permission key                                                                       | passthrough context                     | `403 { error: { code: "AUTHORIZATION_ERROR", ... } }`                           |
| `requireResourceAccess(membership, resourceType, resourceId)` | Membership + resource identity                                                                    | The resource row                        | `404 { error: { code: "NOT_FOUND", ... } }`                                     |

These map directly onto the existing `errorCodeSchema` enum already defined in
`packages/contracts` (Phase 1 Foundation) — no new error codes are required for Phase 2A;
`AUTHENTICATION_ERROR`/`AUTHORIZATION_ERROR`/`NOT_FOUND` already exist.

## 2. Example Endpoint Surface (illustrative — final shape is Phase 5/API-gate scope, per `API_ENDPOINT_CATALOG.md`'s own "may be adjusted during API review" caveat)

| Endpoint                                       | Auth chain                                                                                                    | Notes                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /workspaces`                              | `requireAuth()` only                                                                                          | Lists workspaces the authenticated user is a member of — the one endpoint that legitimately does not take a workspace ID as input, since its job _is_ to enumerate the user's own memberships.                                                                  |
| `POST /workspaces`                             | `requireAuth()` only                                                                                          | Creates a new workspace with the creator as `OWNER`. Whether this also creates a Clerk Organization (per `workspace-model.md` §2's proposed mapping) is a Phase 2 implementation detail.                                                                        |
| `GET /workspaces/:id`                          | `requireAuth → requireWorkspace → requireMembership → requirePermission(workspace.read)`                      | `:id` is resolved and ownership-checked, never trusted at face value (`authorization.md` §2).                                                                                                                                                                   |
| `PATCH /workspaces/:id`                        | `... → requirePermission(workspace.update)`                                                                   |                                                                                                                                                                                                                                                                 |
| `DELETE /workspaces/:id`                       | `... → requirePermission(workspace.delete)`                                                                   | Must additionally enforce the "never zero owners" / ownership-transfer invariant (`workspace-model.md` §5) — mechanism is a Phase 2 decision.                                                                                                                   |
| `POST /workspaces/:id/switch`                  | `requireAuth → requireMembership(user, :id)`                                                                  | Implements `workspace-model.md` §4's switching flow exactly — membership re-verified, then the server establishes the new active-workspace context. Does **not** take a role or permission — switching workspace never itself grants or changes any permission. |
| `GET /workspaces/:id/members`                  | `... → requirePermission(members.read)`                                                                       |                                                                                                                                                                                                                                                                 |
| `POST /workspaces/:id/members/invite`          | `... → requirePermission(members.invite)`                                                                     |                                                                                                                                                                                                                                                                 |
| `PATCH /workspaces/:id/members/:membershipId`  | `... → requirePermission(members.update)` + `requireResourceAccess` on `:membershipId` (must belong to `:id`) | Role changes flow through here — see §3's audit requirement.                                                                                                                                                                                                    |
| `DELETE /workspaces/:id/members/:membershipId` | `... → requirePermission(members.remove)`                                                                     | Must enforce the same "never zero owners" invariant if the target is the workspace's last OWNER.                                                                                                                                                                |
| `GET /me`                                      | `requireAuth()` only                                                                                          | Returns the authenticated application user's own profile + list of memberships — does not require a workspace context, symmetric with `GET /workspaces`.                                                                                                        |
| `POST /webhooks/clerk`                         | **No** `requireAuth()` chain at all — see `identity-sync.md` §2                                               | Public route, excluded from `clerkMiddleware()`'s authenticated matcher, authenticated instead by Clerk's own webhook signature.                                                                                                                                |

## 3. Authorization-Relevant Audit Requirements

Every mutation on `workspace_memberships` (invite, role change, removal) and every
workspace-lifecycle mutation (create, update, delete) writes an `audit_events` row per
`AUDIT_LOGGING.md` (SEC-012)'s required metadata — actor, workspace, event type, resource,
timestamp, outcome. This is not a new rule; it is the existing audit requirement applied
explicitly to the identity/membership surface, called out here because membership and role
changes are exactly the kind of "permission changes" `AUDIT_LOGGING.md` §Audit Events
already lists as requiring capture.

## 4. What This Document Does Not Define

Request/response body schemas (field-level JSON shapes), pagination parameters, and rate
limits for these endpoints are `API_CONTRACTS.md`/`API_ENDPOINT_CATALOG.md`/`API_RATE_LIMITS.md`
concerns to be finalized alongside the rest of the `/api/v1` contract in Phase 5, per
`OPENAPI_REQUIREMENTS.md`'s contract-first rule — this document establishes only the
authorization chain each endpoint must run, not its full OpenAPI definition.
