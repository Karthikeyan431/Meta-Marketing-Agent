# Meta API Contracts

**Document ID:** META-116 | Version 1.2 | Status: Connection-lifecycle rows implemented (Phase 3.1); discovery/ad-account rows implemented (Phase 3.2); sync trigger + campaign/ad-set/ad read rows implemented 2026-09-11 (Phase 4.1); webhook rows remain unimplemented | Phase: 3A (Architecture Finalization, closed); Phase 3.1/3.2/4.1 (Implementation, complete for their own rows)

Consolidates the governing task's illustrative endpoint list against the pre-existing
`ai-marketing-manager-gate-7-api-docs/docs/08-api/API_ENDPOINT_CATALOG.md` (API-002)'s
already-drafted Meta section and `AUTHORIZATION_MODEL.md` (API-006). **No route was
implemented by Phase 3A** — see `phase-3-1-implementation-report.md`/`phase-3-2-
implementation-report.md` for what each later phase actually shipped.

## 1. Endpoint Surface (reconciled)

API-002 (Gate 7, already exists) specifies a **workspace-nested** shape for
connection-management endpoints; the governing task's own illustrative list uses a flatter
shape (`POST /meta/connections/{id}/reconnect`, `DELETE /meta/connections/{id}`). The
workspace-nested form is recommended and adopted here, because it is consistent with every
mutating route already shipped in this codebase (`PATCH/DELETE /workspaces/:id/members/
:membershipId`, `POST /workspaces/:id/ownership-transfer`, `POST /workspaces/:id/members/
invite` — every one of them resolves `:workspaceId` first, then the target resource scoped to
it) — a flat `/meta/connections/:id` route would require re-deriving the workspace from the
connection row rather than the other way around, inverting this project's established
authorization-resolution order for no benefit.

```
POST   /workspaces/:id/meta/connect
GET    /workspaces/:id/meta/connections
GET    /meta/oauth/callback                                    (no requireAuth chain — see meta-oauth.md §2)
POST   /workspaces/:id/meta/connections/:connectionId/reconnect
DELETE /workspaces/:id/meta/connections/:connectionId
POST   /workspaces/:id/meta/sync                               (implemented Phase 4.1 — one job enqueued per selected Ad Account)
GET    /workspaces/:id/meta/businesses                         (live discovery, Phase 3.2 — added, not in this list originally)
GET    /workspaces/:id/meta/ad-accounts                        (live discovery, Phase 3.2 — distinct from the persisted list below)
POST   /workspaces/:id/meta/ad-accounts/select                 (Phase 3.2)
GET    /workspaces/:id/ad-accounts
GET    /workspaces/:id/ad-accounts/:adAccountId
DELETE /workspaces/:id/ad-accounts/:adAccountId                (deselection, Phase 3.2 — extends this already-approved resource path with a new verb)
GET    /workspaces/:id/campaigns[?adAccountId=]                (Phase 4.1 — added, not in this list originally)
GET    /workspaces/:id/campaigns/:campaignId                   (Phase 4.1)
GET    /workspaces/:id/ad-sets[?campaignId=]                    (Phase 4.1)
GET    /workspaces/:id/ad-sets/:adSetId                          (Phase 4.1)
GET    /workspaces/:id/ads[?adSetId=]                             (Phase 4.1)
GET    /workspaces/:id/ads/:adId                                   (Phase 4.1)
GET    /webhooks/meta                                          (verification handshake)
POST   /webhooks/meta                                           (event delivery — meta-webhooks.md)
```

**Phase 4.1 naming**: campaigns/ad-sets/ads follow the same unprefixed `/workspaces/:id/...`
pattern this document already established for the persisted `/ad-accounts` resource (never
`/meta/*`, which stays reserved for connection/provider-lifecycle and live-discovery
operations) — a natural extension of the existing convention, not a new one. Filtering by
parent (`?adAccountId=`, `?campaignId=`, `?adSetId=`) via query parameter, rather than nested
path segments, avoids unwieldy 3-4-level route nesting while every query still resolves
`workspaceId` first (never a parent ID used to imply authorization on its own).

**Phase 3.2 naming reconciliation** (recorded here since this document's §1 predates
discovery): the governing Phase 3.2 task brief's own illustrative list nested ad-account
discovery under `/meta/` (`GET /workspaces/:id/meta/ad-accounts`, `POST .../meta/ad-accounts/
select`, `DELETE .../meta/ad-accounts/:id`) throughout, while this document's original §1
already specified persisted-resource reads at the unprefixed `/workspaces/:id/ad-accounts`
path. Both are correct for what they represent and neither is dropped: the `/meta/`-prefixed
routes are live, ephemeral discovery reads and the selection mutation (matching this
codebase's existing convention that `/meta/*` is for connection/provider-lifecycle
operations); the unprefixed `/workspaces/:id/ad-accounts` routes are the persisted resource
(list + deselect), exactly as this document already specified for the `GET` form — `DELETE`
was added to the same already-approved path for symmetry, rather than introducing a second,
`/meta/`-prefixed path for the same resource.

**Known pre-existing discrepancy, flagged, not resolved by this phase**: API-002 prefixes its
whole catalog with `/api/v1`; this project's actually-implemented routes
(`apps/api/src/routes/*`) do not use any version prefix. This is a pre-existing inconsistency
between Gate 7's draft catalog and shipped practice, unrelated to Meta specifically — Phase
3.1 should follow the already-shipped, unprefixed convention (consistent with
`identity-api-contracts.md`'s own already-implemented routes), not introduce a new `/api/v1`
prefix solely for Meta endpoints.

## 2. Authorization Chain (per endpoint, extending `AUTHORIZATION_MODEL.md` (API-006)'s

already-specified chain — reuses the exact primitives shipped in `apps/api/src/plugins/
authorization.ts`, no new primitive)

| Endpoint                                                        | Chain                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /workspaces/:id/meta/connect`                             | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.connect)` → issues OAuth state (`meta-oauth.md`)                                                                                                                                                        |
| `GET /workspaces/:id/meta/connections`                          | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read)`                                                                                                                                                                                                  |
| `GET /meta/oauth/callback`                                      | No `requireAuth()` — authenticated by state validation instead (`meta-oauth.md` §3), identical exception pattern to `POST /webhooks/clerk`                                                                                                                                            |
| `POST /workspaces/:id/meta/connections/:connectionId/reconnect` | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.reconnect) → requireResourceAccess(connectionId, workspace.id)`                                                                                                                                         |
| `DELETE /workspaces/:id/meta/connections/:connectionId`         | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.disconnect) → requireResourceAccess(connectionId, workspace.id)`                                                                                                                                        |
| `POST /workspaces/:id/meta/sync`                                | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read)` (triggering a sync is a read-adjacent operation on already-authorized data, not a Meta-side mutation — consistent with `meta_connection.read`'s existing "worker-invocable: yes" classification) |
| `GET /workspaces/:id/ad-accounts[/{id}]`                        | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read) → requireResourceAccess` (for the single-resource form)                                                                                                                                           |
| `GET /workspaces/:id/meta/businesses`                           | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read)` (Phase 3.2 — live discovery read)                                                                                                                                                                |
| `GET /workspaces/:id/meta/ad-accounts`                          | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read)` (Phase 3.2 — live discovery read)                                                                                                                                                                |
| `POST /workspaces/:id/meta/ad-accounts/select`                  | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.connect)` (Phase 3.2 — a mutation, reuses `meta_connection.connect` per `meta-account-discovery.md` §5, no new permission)                                                                              |
| `DELETE /workspaces/:id/ad-accounts/:adAccountId`               | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.disconnect) → requireResourceAccess(adAccountId, workspace.id)` (Phase 3.2 — deselection, the inverse of selection, reuses `meta_connection.disconnect` by the same "no new permission" reasoning)      |
| `GET /workspaces/:id/campaigns[/{id}]`                          | `requireAuth → requireWorkspaceMembership → requirePermission(meta_connection.read) → requireResourceAccess` (for the single-resource form) (Phase 4.1)                                                                                                                               |
| `GET /workspaces/:id/ad-sets[/{id}]`                            | Same chain as campaigns (Phase 4.1)                                                                                                                                                                                                                                                   |
| `GET /workspaces/:id/ads[/{id}]`                                | Same chain as campaigns (Phase 4.1)                                                                                                                                                                                                                                                   |
| `GET`/`POST /webhooks/meta`                                     | No `requireAuth()` — authenticated by Meta's own signature (`meta-webhooks.md` §1–2), identical exception pattern to `POST /webhooks/clerk`                                                                                                                                           |

Every endpoint above reuses `apps/api/src/plugins/authorization.ts`'s already-shipped
`requireAuth`, `requireWorkspaceMembership`, `requirePermission`, `requireResourceAccess` —
**no competing authorization path is introduced.** Per the governing task's explicit
instruction: client-supplied `workspaceId`, `connectionId`, ad-account/campaign/ad-set/ad IDs
are never trusted directly — every one resolves through the same server-side, already-
authorized chain, exactly as every existing route in this codebase already does.

## 3. Error Envelope (unchanged, no new convention)

Every Meta endpoint uses the existing `{data, meta}` / `{error: {code, message, requestId}}`
envelope (`packages/contracts/src/envelope.ts`, already shipped). `meta-error-model.md` §1's
categories map onto the existing `ErrorCode` enum (`AUTHENTICATION_ERROR`,
`AUTHORIZATION_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`PROVIDER_UNAVAILABLE`, `INTERNAL_ERROR`) — `PROVIDER_UNAVAILABLE` (already defined, currently
unused by any shipped route) is the natural home for `TRANSIENT_PROVIDER_FAILURE`/`TIMEOUT`/
`UNKNOWN_PROVIDER_FAILURE`. No new error code is required.

## 4. What This Document Does Not Define

Field-level request/response JSON shapes, pagination parameters for `GET /workspaces/:id/
ad-accounts`, and the final locked OpenAPI contract remain Phase 5/API-gate scope, per
`identity-api-contracts.md` §4's already-established precedent for exactly this kind of
deferral (that document used identical wording for the identity API surface, and Phase
2.5/2.6 implementation reconciled cleanly against it without rework) — this document
establishes only the authorization chain and endpoint surface, not the full contract.
