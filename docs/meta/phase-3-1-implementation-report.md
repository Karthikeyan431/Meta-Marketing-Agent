# Phase 3.1 Implementation Report — Meta OAuth & Connection

**Document ID:** META-122 | Version 1.0 | Status: Complete | Phase: 3.1 (Implementation)

## 1. Baseline

Entering Phase 3.1: HEAD `115779aa8989375da63a97f13f64ec700a450098` (Phase 3A, architecture
approved and closed). Branch `main`, `origin/main` matched, working tree clean — all verified
before any change. Phase 3A's 21 architecture documents under `docs/meta/` and the owner
decision package were read and treated as binding, not re-derived.

## 2. Meta Documentation Re-Verification (2026-09-10, fresh — supersedes Phase 3A's pass from

earlier the same day for the OAuth-specific items below)

All items live-fetched against `developers.facebook.com` this session, immediately before
implementation, per the governing task's explicit "do not trust an old version number"
instruction.

| #     | Item                                              | Source                                                                                                   | Finding                                                                                                                                                                                         | Implementation implication                                                                                                                                  |
| ----- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Current supported Graph API versions              | `/docs/graph-api/changelog`                                                                              | v26.0 (2026-07-29, latest) through v13.0 (expired); full table recorded                                                                                                                         | Confirms v25.0/v26.0 findings from Phase 3A, unchanged                                                                                                      |
| 2     | Recommended initial version                       | Same                                                                                                     | v25.0 — longer support runway (until 2028-07-29), used in Meta's own current examples                                                                                                           | `META_API_VERSION` env var defaults to `"v25.0"`                                                                                                            |
| 3     | Version support/retirement                        | Same                                                                                                     | v25.0 supported until 2028-07-29; auto-upgrade mechanism announced from 2026-07-29                                                                                                              | Version is configuration (env var), never hardcoded per-call                                                                                                |
| 4     | OAuth authorization endpoint                      | `/docs/facebook-login/guides/advanced/manual-flow/`                                                      | `GET https://www.facebook.com/v25.0/dialog/oauth`                                                                                                                                               | `buildMetaAuthorizationUrl()` in `meta-client.ts`                                                                                                           |
| 5     | Token exchange flow                               | Same + `/documentation/facebook-login/guides/access-tokens/get-long-lived/`                              | `GET https://graph.facebook.com/v25.0/oauth/access_token`; long-lived exchange via `grant_type=fb_exchange_token`                                                                               | `exchangeCodeForToken()`/`exchangeForLongLivedToken()`                                                                                                      |
| 6     | Required OAuth parameters                         | Same                                                                                                     | `client_id`, `redirect_uri`, `state` (required, CSRF), `response_type`, `scope`                                                                                                                 | All implemented; `response_type` fixed to `code` (server-side flow only)                                                                                    |
| 7     | `redirect_uri` requirements                       | Same                                                                                                     | Must be pre-registered in the App Dashboard, must match exactly                                                                                                                                 | Never client-suppliable — `META_OAUTH_REDIRECT_URI` is a fixed server config value                                                                          |
| 8     | `state` behavior                                  | Same                                                                                                     | Explicitly the CSRF defense, echoed back unchanged                                                                                                                                              | Redis-backed, single-use, 10-minute TTL, bound to user+workspace (`meta-oauth-state.ts`)                                                                    |
| 9     | Current permission names                          | `/docs/permissions/reference/*`                                                                          | `ads_read`, `ads_management`, `business_management` — all still current                                                                                                                         | Used verbatim, matches OD-3A-02                                                                                                                             |
| 10–12 | `ads_read`/`ads_management`/`business_management` | Same                                                                                                     | Definitions/App-Review/Business-Verification requirements confirmed; `ads_management`/`business_management` depend on `pages_read_engagement`+`pages_show_list`, `ads_read` has no dependencies | All 5 scopes requested (`META_OAUTH_SCOPES`)                                                                                                                |
| 13    | Dependency permissions                            | Same                                                                                                     | See #10–12                                                                                                                                                                                      | Included in scope list                                                                                                                                      |
| 14    | App Review requirements                           | Same                                                                                                     | Screencast + written justification required for all 3 core permissions                                                                                                                          | Not performed this phase — Development-mode testing doesn't require it (#16)                                                                                |
| 15    | Business Verification requirements                | `/docs/development/release/business-verification`                                                        | Required for Advanced Access / external users; **explicitly NOT required when the app is only used by users who have a role on the app itself**                                                 | Enables real UAT in Development mode without Business Verification, once real credentials exist                                                             |
| 16    | Development-mode behavior                         | `/docs/development/build-and-test/test-users`                                                            | "All features are active for test users while your app is in Development mode"                                                                                                                  | Confirms Phase 3.1 can be fully tested in dev mode once a real Meta app exists                                                                              |
| 17    | Development/test-user capabilities                | Same                                                                                                     | Full access to all permissions/features in dev mode                                                                                                                                             | Same as above                                                                                                                                               |
| 18    | Token lifetime                                    | `/documentation/facebook-login/guides/access-tokens/get-long-lived/`                                     | Long-lived tokens ~60 days (`expires_in` ≈ 5,184,000s)                                                                                                                                          | `tokenExpiresAt` computed from `expires_in`; drives future `meta-connection-health.md` checks (Phase 3.2 proper, folded into this phase's connection model) |
| 19    | Account/business discovery capabilities           | Not separately verified — `/me` (basic identity) is stable, decade-old Graph API surface, not re-fetched | `GET /me?fields=id` used for minimal identity only                                                                                                                                              | Full discovery is explicitly Phase 3.3, not implemented                                                                                                     |

No item required marking BLOCKED — official documentation was reachable for every item in
scope for OAuth/connection lifecycle.

## 3. API Version

`META_API_VERSION` (env var, default `"v25.0"`) — configuration, never hardcoded in
application logic, per `meta-architecture.md` §1 principle 7. Every Meta client function
(`meta-client.ts`) takes `apiVersion` as an explicit parameter.

## 4. OAuth Implementation

`POST /workspaces/:id/meta/connect` issues a state and returns `{ authorizationUrl }` for the
frontend to redirect the browser to (never an HTTP redirect from the API itself, matching this
codebase's existing `POST /workspaces/:id/switch` REST pattern). `GET /meta/oauth/callback`
handles Meta's redirect back, exchanges the code server-side, validates the token, fetches
minimal identity, and persists the connection. See §6 for the full sequence.

## 5. State/CSRF Security

Redis-backed (`apps/api/src/plugins/meta-oauth-state.ts`), reusing the already-shipped
`getRedisConnection()` — no new infrastructure. Crypto-random UUID token, 10-minute TTL,
atomic single-use consumption via a Lua `GET`+`DEL` script (rules out a GET-then-DEL race
between two near-simultaneous consumption attempts). Bound to `{userId, workspaceId}` at
issuance; the callback additionally runs `requireAuth()` and compares the **currently**
authenticated user against the state's stored `userId` (rejecting "wrong user"), then
re-verifies the membership/permission fresh against the database (rejecting "wrong
workspace"/revoked permission) — never trusting the state payload alone as still-authorized,
consistent with this codebase's "never trust a prior check, re-derive fresh" convention
(ADR-028). The redirect URI is never part of the state payload — it is a single, fixed,
server-configured value, never client-suppliable, so there is nothing to separately bind.

## 6. Token Security

AES-256-GCM application-layer encryption (`packages/domain/src/meta/crypto.ts`), key from
`META_CREDENTIAL_ENCRYPTION_KEY` (32 bytes, base64). Credential ciphertext/IV/auth-tag are
separate `Bytes?` columns, nullable so a `DISCONNECTED` connection can have them genuinely
deleted (not merely marked inactive), per OD-3A-05's binding engineering rule. Never returned
through any API response (`metaConnectionSummarySchema` excludes them entirely) — verified by
dedicated tests (§14). Never logged — the raw access token appears in no audit event metadata
(verified by a dedicated test asserting this against real `AuditEvent` rows). Managed-KMS
integration (AWS Secrets Manager, ADR-006) remains a documented future improvement, not
implemented this phase (§20).

## 7. Connection Lifecycle

One `MetaConnection` row per workspace (`@@unique` on `workspaceId`, OD-3A-04) —
`packages/domain/src/meta/connections.ts`'s `upsertMetaConnection()` creates on first connect,
updates in place (incrementing `connectionVersion`) on every subsequent reconnect, inside a
single transaction that also writes the `meta_connection.connected`/`reconnected` audit event.
`disconnectMetaConnection()` sets `status: DISCONNECTED`, `disconnectedAt`, and nulls all
three credential columns in the same transaction as the `meta_connection.disconnected` audit
event. States: `CONNECTED`, `DEGRADED`, `REAUTH_REQUIRED`, `DISCONNECTED`, `ERROR` (the task's
own 5-state list — see §19 for a note on this vs. `meta-token-security.md`'s `REVOKED`
naming).

## 8. Authorization

Every route: `requireAuth() → requireWorkspaceMembership() → requirePermission()` (+
`findMetaConnectionByWorkspace`-based resource-ownership check for connection-ID-addressed
routes) — the exact, unchanged primitives from `apps/api/src/plugins/authorization.ts`. No
competing authorization path. Permissions used: `meta_connection.connect` (connect),
`meta_connection.read` (list), `meta_connection.reconnect` (reconnect),
`meta_connection.disconnect` (disconnect) — all already seeded in `rbac-catalog.ts` since
Phase 2.3/2.4A, zero catalog changes this phase.

## 9. Tenant Isolation

Every connection lookup is scoped by the already-authorized `workspaceId` first
(`findMetaConnectionByWorkspace`); a connection-ID-addressed route (reconnect/disconnect)
additionally confirms the found connection's own `id` matches the path parameter — a
`connectionId` from a different workspace never matches, returning 404 identically to a
nonexistent one (no enumeration signal). External Meta IDs (`externalUserId`) are stored for
display only, never used to resolve or authorize a request. Verified by 5 dedicated
cross-workspace tests, including one that directly asserts a workspace's own connection list
never contains another workspace's connection ID or external Meta user ID string.

## 10. API Surface

```
POST   /workspaces/:id/meta/connect
GET    /workspaces/:id/meta/connections
GET    /meta/oauth/callback                                    (no requireAuth chain up front — state-validated, then requireAuth() runs)
POST   /workspaces/:id/meta/connections/:connectionId/reconnect
DELETE /workspaces/:id/meta/connections/:connectionId
```

Matches `meta-api-contracts.md` §1's workspace-nested shape exactly (not the governing task's
flatter illustrative list, which `meta-api-contracts.md` already explicitly reconciled and
recommended against — see that document's own §1 note). No `/api/v1` prefix, consistent with
every other route already shipped in `apps/api`.

## 11. Error Handling

`meta-error-model.md` §1's categories implemented pragmatically for this phase's actual
surface: `authentication_failed`, `authorization_failed`, `rate_limited`,
`provider_unavailable`, `invalid_parameter`, `unknown_provider_failure`
(`classifyMetaApiFailure()` in `routes/meta.ts`), plus OAuth-specific reasons (`invalid_state`,
`wrong_user`, `wrong_workspace`, `oauth_cancelled`, `token_exchange_failed`,
`token_validation_failed`, `insufficient_permission`, `identity_lookup_failed`). Every
callback failure redirects to `{CORS_ORIGIN}/app/meta/connect-result?status=error&reason=...`
rather than exposing a raw Meta error body. HTTP-level errors reuse the existing
`errorEnvelope`/error-code conventions (`CONFLICT`, `NOT_FOUND`, `PROVIDER_UNAVAILABLE`,
`AUTHORIZATION_ERROR`) — no new error code was required.

## 12. Audit

Every Meta connection lifecycle event reuses the existing `AuditEvent` schema, zero new audit
system: `meta_connection.oauth_started` (connect/reconnect initiation),
`meta_connection.oauth_failed` (every callback failure path, with a normalized `reason` in
metadata), `meta_connection.connected`/`meta_connection.reconnected` (successful
`upsertMetaConnection`), `meta_connection.disconnected` (successful disconnect). Permission
denials at the route layer are not separately audited, consistent with this codebase's
existing convention (established in Phase 2.5's report) — only OAuth-specific and
domain-mutation events are audited.

## 13. Automated Tests

35 new integration tests (`tests/integration/api-meta.test.ts`), all against the real HTTP
surface via `app.inject()`, plus 7 new unit tests for the encryption utility
(`packages/domain/src/meta/crypto.test.ts`). **Unit 69/69 (62 prior + 7 new), integration
187/187 (152 prior + 35 new), zero regressions.**

## 14. Security Tests

- **OAuth**: valid state, missing state, missing code, invalid state, replayed state, expired
  state (simulated via direct Redis key deletion), wrong user, wrong workspace (membership
  removed mid-flow), canceled/denied OAuth.
- **Authorization**: unauthenticated (401) and forbidden-role (403) for every route; forged
  workspace ID (non-member) for connect/list.
- **Token security**: App Secret never appears in the returned authorization URL; connection
  list responses never contain credential fields (exact key-set asserted) or the raw access
  token string; no audit event's metadata ever contains the raw access token; disconnected
  connections have `credentialCiphertext`/`Iv`/`AuthTag` verified `null` at the database
  level.
- **Connection**: create, duplicate (409), reconnect (version increment, same row), disconnect,
  already-disconnected (409), wrong workspace (404), provider failure at every step of the
  callback (token exchange, validation, identity lookup).
- **Provider errors**: insufficient permission (missing scope), invalid/expired token
  (`is_valid: false`), provider 5xx, rate limit (429), network-level timeout/rejection.
- **Tenant isolation**: cross-workspace reconnect/disconnect (404), a workspace's connection
  list never contains another workspace's connection ID or external Meta ID.

## 15. Real Meta UAT

**BLOCKED — no Meta Developer App exists yet.** Confirmed by direct inspection before this
phase began: no `META_APP_ID`/`META_APP_SECRET` anywhere in `.env`, `.env.example`, or any
prior implementation report; `.env`'s own comment explicitly states Meta variables are "out of
scope until Phase 3." Creating a Meta Developer App is interactive account/app creation,
which — per this project's standing operating constraint, reiterated throughout every prior
phase of this project — must be performed by the human, not by me. The owner has confirmed
they will create a Development-mode Meta app and provide `META_APP_ID`/`META_APP_SECRET`/a
registered redirect URI. Once provided, per this phase's own re-verification (#15–17 above),
real UAT does **not** require App Review or Business Verification first — Development mode
with the app's own admin/tester role is sufficient, since "all features are active for test
users while your app is in Development mode" and Business Verification is explicitly not
required for users with a role on the app itself. Real UAT (Step 14's 11-point checklist)
remains an explicit prerequisite for Phase 3.2 sign-off, not performed in this report.

## 16. CI Result and Run URL

**Green.** Run `34483974408` — `completed` / `success`, every stage passed, including the
clean-database migration verification (`prisma migrate deploy` against a freshly-created
Postgres service container — the authoritative clean-DB check referenced in §18):
https://github.com/Karthikeyan431/Meta-Marketing-Agent/actions/runs/34483974408

## 17. Files Changed

- `packages/domain/prisma/schema.prisma` — `MetaConnection` model, `MetaConnectionStatus`
  enum, `Workspace.metaConnection` relation.
- `packages/domain/prisma/migrations/20260910132104_meta_connection/` — new migration.
- `packages/domain/src/meta/` (new) — `crypto.ts`, `crypto.test.ts`, `connections.ts`,
  `errors.ts`, `index.ts`.
- `packages/domain/src/index.ts` — exports the new `meta` module + `MetaConnection`/
  `MetaConnectionStatus` types.
- `packages/contracts/src/meta.ts` (new) — response schemas.
- `packages/contracts/src/index.ts` — exports.
- `apps/api/src/env.ts` — 5 new optional Meta env vars.
- `apps/api/src/plugins/meta-client.ts` (new) — minimal Meta HTTP client (OAuth scope only).
- `apps/api/src/plugins/meta-oauth-state.ts` (new) — Redis-backed OAuth state.
- `apps/api/src/routes/meta.ts` (new) — the 5 routes.
- `apps/api/src/app.ts` — registers `metaRoute`.
- `tests/integration/api-meta.test.ts` (new) — 35 tests.

No unrelated files changed (diff-stat verified against pre-phase HEAD).

## 18. Migration

One migration, `20260910132104_meta_connection` — creates `meta_connections` (all credential
columns nullable, per §6) and the `MetaConnectionStatus` enum, adds a unique index on
`workspace_id`, adds a cascading foreign key to `workspaces`. `prisma migrate status`
confirms clean before and after. **Clean-database verification**: a local `prisma migrate
reset` was attempted to independently verify the migration applies from empty, but Prisma's
own AI-agent safety guard blocked it (a `migrate reset` is a genuinely destructive,
irreversible action even against a local dev database, and per this session's standing
practice around destructive actions, I did not override that guard or ask for approval to
run it locally when an equivalent, non-destructive verification already happens
automatically). **CI's migration step applies every migration via `prisma migrate deploy`
against a freshly-created Postgres service container on every run — this is the authoritative
clean-database verification for this migration**, confirmed green in §16.

## 19. Known Limitations

- Real Meta UAT is blocked pending owner-provided Development-mode credentials (§15).
- Encryption is application-layer AES-256-GCM with an env-var key, not a managed KMS
  (AWS Secrets Manager, ADR-006) — a documented, deliberate Phase 3.1 scope decision, not an
  oversight (`packages/domain/src/meta/crypto.ts`'s own doc comment).
- The Prisma `MetaConnectionStatus` enum uses `ERROR` as its 5th value (matching the governing
  task's explicit state list) rather than `meta-token-security.md`'s `REVOKED` naming — both
  concepts collapse to this single generic terminal-failure state for Phase 3.1, since this
  phase does not yet implement proactive Meta-side-revocation detection distinct from a
  generic error (that refinement, if wanted, is a `meta-connection-health.md` Phase 3.2-proper
  concern).
- `POST /workspaces/:id/meta/connect`'s response is a JSON body (`{authorizationUrl}`), not an
  HTTP redirect — matches this codebase's existing `POST /workspaces/:id/switch` REST
  convention; the actual browser redirect happens client-side (frontend not built yet, out of
  this phase's backend-only scope).
- `GET /meta/oauth/callback`'s final redirect target (`{CORS_ORIGIN}/app/meta/connect-result`)
  points at a frontend page that does not exist yet — the API-side contract is correct and
  tested; the receiving page is a future frontend-phase concern.
- No account/business discovery, campaign sync, Insights, webhooks, or mutations — all
  explicitly out of this phase's scope (Phase 3.3/Phase 4/Phase 5).

## 20. Phase 3.2 Prerequisites

Real Meta Developer App credentials (owner-provided) to close §15's UAT blocker. Everything
else — connection health-state transition logic beyond the basic 5-value enum, proactive
health checks, reconnect-detection refinements — is already scoped in `meta-connection-
health.md` and can build directly on this phase's `MetaConnection` model without rework.
