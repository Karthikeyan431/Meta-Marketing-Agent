# Phase 3.2 Implementation Report — Meta Business & Ad Account Discovery

**Document ID:** META-123 | Version 1.0 | Status: Complete, real Meta UAT verified 2026-09-10 | Phase: 3.2 (Implementation) — content-wise `phase-3-implementation-sequence.md`'s Phase 3.3; see §1 for the naming reconciliation

## 1. Baseline

Entering this phase: HEAD `db3a7b0df44692df7be2d94eb3848a3690d866d8` (Phase 3.1, implemented
and real-UAT-verified, CI green). Branch `main`, working tree clean before any change.

**Naming reconciliation (owner-confirmed 2026-09-10):** the governing task labeled this work
"Phase 3.2." Per the already owner-approved `phase-3-implementation-sequence.md` §1, this is
that document's **Phase 3.3** ("Business + Ad Account Discovery") — its own "Phase 3.2" is
"Secure Token / Connection Lifecycle," whose one still-outstanding item is **OD-3A-08's
workspace-level Meta connection kill switch**, not yet built. This discrepancy was surfaced
before any code was written and put to the owner directly; the owner chose to proceed with
discovery under the task's own "Phase 3.2" label rather than block on the numbering (see
`phase-3-implementation-sequence.md` §5 for the same note, recorded on both sides). The kill
switch is not a blocker for this phase's own completion (Phase 3 still has zero mutation
capability — OD-3A-09 — regardless of which sub-phase discovery is numbered as), but it
remains explicitly outstanding and must land before any future phase enables production
mutation capability, per OD-3A-08's own binding text.

Architecture read before any change: `meta-account-discovery.md`, `meta-connection-model.md`,
`meta-resource-model.md`, `meta-api-contracts.md`, `meta-adapter-contract.md`,
`meta-permissions.md`, `meta-error-model.md`, `meta-rate-limits.md`, `meta-sync.md`,
`meta-threat-model.md`, `meta-test-matrix.md`, `phase-3-implementation-sequence.md`,
`phase-3-owner-decision-package.md`, `docs/identity/authorization.md`, `docs/identity/rbac.md`,
`ARCHITECTURE_DECISION_REGISTER.md`, and the actual Phase 3.1 code/schema (`packages/domain/
prisma/schema.prisma`, `apps/api/src/routes/meta.ts`, `apps/api/src/plugins/meta-client.ts`,
`packages/domain/src/rbac-catalog.ts`) — treated as binding, not re-derived.

**What was already represented vs. missing (the required reconciliation step):**

| Item                                                            | Status before this phase                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MetaConnection` model, encrypted credentials, OAuth lifecycle  | Already implemented (Phase 3.1)                                                                                                                                     |
| `meta_connection.read/connect/reconnect/disconnect` permissions | Already seeded (Phase 2.3/2.4A) — reused unchanged                                                                                                                  |
| Adapter's `getBusiness(connectionRef, id)` (single lookup)      | Specified, not implemented                                                                                                                                          |
| A `listBusinesses`/`listAdAccounts` (list) adapter method       | Not specified at all — a genuine gap, filled this phase (§6)                                                                                                        |
| `AdAccount` schema/table                                        | Conceptual only (`meta-resource-model.md` §4) — not migrated                                                                                                        |
| Discovery/selection/deselection routes                          | Not specified in `meta-api-contracts.md`'s endpoint list — filled this phase, reconciled against that document's existing `/workspaces/:id/ad-accounts` naming (§6) |
| OD-3A-08 kill switch                                            | Not implemented — remains outstanding, out of this phase's own scope                                                                                                |

## 2. Meta Documentation Re-Verification (2026-09-10, fresh — discovery-specific items only;

OAuth-specific items already re-verified in Phase 3.1, not re-checked here)

| #   | Item                                          | Source                                                                                                                                                                                                                                                               | Finding                                                                                                                                                                                               | Implementation implication                                                                                                                                                                             |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Ad Account fields                             | `developers.facebook.com/docs/marketing-api/reference/ad-account`                                                                                                                                                                                                    | `id` (`act_{id}`), `account_id`, `name`, `currency`, `timezone_name`, `account_status`, `business`                                                                                                    | Exact field set requested in `listAdAccounts()`                                                                                                                                                        |
| 2   | `account_status` numeric values               | Same                                                                                                                                                                                                                                                                 | `1`=ACTIVE, `2`=DISABLED, `3`=UNSETTLED, `7`=PENDING_RISK_REVIEW, `8`=PENDING_SETTLEMENT, `9`=IN_GRACE_PERIOD, `100`=PENDING_CLOSURE, `101`=CLOSED, `201`/`202`=ANY_ACTIVE/ANY_CLOSED (filter values) | Normalized in `meta-client.ts`; any unrecognized future code maps to `UNKNOWN`, never crashes                                                                                                          |
| 3   | Ad-account listing endpoint                   | `developers.facebook.com/docs/graph-api/reference/user/adaccounts` (the formal reference page 404'd on direct fetch — likely client-rendered; corroborated via the Marketing API's own get-started examples and community-documented usage of the identical pattern) | `GET /me/adaccounts?fields=...` — real-UAT-confirmed working exactly as documented (§13)                                                                                                              | `listAdAccounts()` calls `GET /{apiVersion}/me/adaccounts`                                                                                                                                             |
| 4   | Business listing edge                         | `developers.facebook.com/docs/graph-api/reference/user/`                                                                                                                                                                                                             | `businesses` edge — "Businesses associated with the user"                                                                                                                                             | `listBusinesses()` calls `GET /{apiVersion}/me/businesses`                                                                                                                                             |
| 5   | Business fields                               | `developers.facebook.com/docs/marketing-api/reference/business`                                                                                                                                                                                                      | `id`, `name`, `verification_status`                                                                                                                                                                   | Exact field set requested in `listBusinesses()`                                                                                                                                                        |
| 6   | Business-scoped account listing (alternative) | `developers.facebook.com/docs/marketing-api/business-asset-management/guides/ad-accounts`                                                                                                                                                                            | `GET /{business_id}/owned_ad_accounts` also exists                                                                                                                                                    | Not used — `/me/adaccounts` already aggregates both directly-shared and Business-owned accounts a token can access, confirmed live (§13); avoids a second, redundant traversal per discovered Business |
| 7   | Pagination                                    | `developers.facebook.com/docs/graph-api/results`                                                                                                                                                                                                                     | `paging.cursors.after/before`, `paging.next`/`previous`; "stop when `next` is absent," never rely on `count < limit`                                                                                  | `fetchAllPages()` follows `paging.next`, bounded to `MAX_DISCOVERY_PAGES = 20` (a safety bound, never a product limit)                                                                                 |
| 8   | Required permissions                          | Already verified Phase 3.1 (`meta-permissions.md` §1, unchanged this pass)                                                                                                                                                                                           | `business_management` for Business discovery; `ads_read`/`ads_management` (+ dependencies) already requested                                                                                          | No new permission required — the existing Phase 3.1 OAuth scope already covers discovery                                                                                                               |
| 9   | Provider errors                               | Already verified Phase 3.1 (`meta-error-model.md`, unchanged this pass)                                                                                                                                                                                              | Same normalized categories apply to discovery calls                                                                                                                                                   | Reuses `classifyMetaApiFailure()` unchanged                                                                                                                                                            |
| 10  | Rate limits                                   | Already verified Phase 3.1 (`meta-rate-limits.md`, unchanged this pass)                                                                                                                                                                                              | Same BUC model, same header-based detection                                                                                                                                                           | Discovery failures reuse the same `rate_limited` classification → `429`/`RATE_LIMITED`                                                                                                                 |

No item in this table was unverifiable — no blocker to report.

## 3. Business Discovery

`GET /workspaces/:id/meta/businesses` — resolves the workspace's own `MetaConnection` server-
side (never a client-supplied credential or connection reference), requires the connection to
be `CONNECTED`, decrypts its credential, calls `listBusinesses()` (live, `GET /me/businesses`,
paginated internally), and returns only `{id, name, verificationStatus}` per business — never
persisted (matches `meta-account-discovery.md` §2's "this is a read, not a mutation").
Failures are classified and audited (`meta_business_discovery.failed`), never exposing a raw
Meta error body.

## 4. Ad Account Discovery

`GET /workspaces/:id/meta/ad-accounts` — same resolution/authorization shape as business
discovery. Calls `listAdAccounts()` (live, `GET /me/adaccounts`, paginated internally) and, in
parallel, reads the workspace's own already-persisted `AdAccount` rows, so each discovered
candidate carries an `alreadySelected` boolean without a second client round trip. Normalizes:
external ID, name, currency, timezone, `account_status` (→ `ACTIVE`/`DISABLED`/etc., never
Meta's raw numeric code), Business association (nullable — a directly-shared account may have
none), never assuming every returned account is authorized for the workspace (selection is a
distinct, explicit step — §"Account Selection" below).

## 5. Data Model

One new table, `ad_accounts` (`AdAccount` Prisma model) — no separate `Business` table
(`meta-account-discovery.md`'s "do not persist businesses automatically unless the approved
data model requires it" — it does not; discovery is ephemeral, and Business display metadata
is denormalized onto `AdAccount` instead, avoiding an unnecessary second table for data that
only ever accompanies an ad account in this application's UI).

```
id                  (internal PK)
workspaceId         (tenant boundary — MetaConnection already provides it 1:1 per workspace,
                     but AdAccount carries its own workspaceId directly rather than requiring
                     a join through MetaConnection for every authorization check, mirroring
                     MetaConnection's own directly-carried workspaceId)
metaConnectionId     (FK — which connection discovered/authorized this account)
externalId           (Meta's `act_{id}` — round-trips into future Graph API calls)
name, currency, timezone, accountStatus, businessExternalId, businessName
status               (ACTIVE | DESELECTED — this application's own selection lifecycle,
                     distinct from Meta's own accountStatus)
selectedAt, deselectedAt, lastSyncedAt (unwritten until Phase 4.1's sync worker exists)
createdAt, updatedAt
```

`@@unique([workspaceId, externalId])` — the required `internal ID + workspace scope +
external ID` shape (never the external ID alone as an authorization key), matching
`meta-resource-model.md` §1-2 exactly. Re-selecting an already-`ACTIVE` account is idempotent
(metadata refreshed); re-selecting a `DESELECTED` account reactivates the same row rather than
creating a duplicate — real-UAT-confirmed (§13).

## 6. API

5 new endpoints (see `meta-api-contracts.md` §1's Phase 3.2 addendum for the full naming
reconciliation against that document's pre-existing, ad-account-related rows):

```
GET    /workspaces/:id/meta/businesses           — live discovery
GET    /workspaces/:id/meta/ad-accounts          — live discovery (distinct from the persisted list below)
POST   /workspaces/:id/meta/ad-accounts/select    — mutation: persists one or more selected accounts
GET    /workspaces/:id/ad-accounts                — persisted, ACTIVE-only selected accounts (matches this document's already-approved naming exactly)
DELETE /workspaces/:id/ad-accounts/:adAccountId   — deselection (extends the already-approved single-resource path with a new verb)
```

Every route reuses the existing `{data, meta}`/`{error: {code, message, requestId}}` envelope
— no new convention.

## 7. Adapter

`apps/api/src/plugins/meta-client.ts` gains `listBusinesses`/`listAdAccounts` — a deliberate,
documented extension of `meta-adapter-contract.md`'s `getBusiness(connectionRef,
externalBusinessId)` (a single-object lookup, which cannot express "list everything this token
can access"). Both: never leak Meta's raw response shape past this file (return
application-normalized `MetaBusinessSummary`/`MetaAdAccountSummary`); follow `paging.next`
internally via a shared `fetchAllPages()` helper, bounded to `MAX_DISCOVERY_PAGES = 20`; throw
the same `MetaApiError` the OAuth methods already throw, classified by the same
`classifyMetaApiFailure()` the callback route already uses — no second error-handling path.

## 8. Authorization

Every new route reuses the unchanged `requireAuth → requireWorkspaceMembership →
requirePermission → requireResourceAccess` chain — no competing authorization path. Discovery
reads use `meta_connection.read` (ALL_ROLES, already seeded); the selection mutation reuses
`meta_connection.connect` (OWNER/ADMIN) exactly as `meta-account-discovery.md` §5 specifies
("part of the connection-establishment flow, not a separate lesser-privileged action" — no new
permission); deselection reuses `meta_connection.disconnect` (OWNER/ADMIN) by the same
reasoning, applied to the inverse operation. **Zero changes to `packages/domain/src/
rbac-catalog.ts`** — the entire RBAC catalog, role set, and permission list are unchanged from
Phase 2.3/2.4A, confirmed by `rbac-seed.test.ts` still passing unmodified.

Selection never trusts client-supplied account metadata: only the external ID is accepted from
the client, used purely as an index into a **fresh** `listAdAccounts()` call through the
workspace's own authorized connection — every other field (name, currency, timezone, status,
business) is always the just-fetched, server-verified value. Any requested external ID absent
from that fresh result set is rejected (`AdAccountNotDiscoverableError`, `422`) before any row
is touched, atomically for the whole batch.

## 9. Tenant Isolation

Every `AdAccount` lookup resolves `id` + `workspaceId` in the same query
(`findAdAccountByWorkspace`), never `id` alone — a foreign workspace's account ID is
indistinguishable from a nonexistent one (`404`, never `403`, matching `authorization.md` §3's
resource-enumeration policy). Verified by both mocked integration tests and real UAT (§13):
Workspace B sees zero of Workspace A's selected accounts; a `DELETE` against Workspace A's
account through Workspace B's URL returns `404` and leaves the account untouched; selecting the
same real external ad-account ID concurrently in two different workspaces creates two fully
independent rows (mocked concurrency test).

## 10. Tests

`tests/integration/api-meta-discovery.test.ts` — **39 new integration tests**, all passing,
covering every required category from this phase's task brief: Discovery (successful/paginated
businesses and ad accounts, empty result, Meta provider failure, rate limit, timeout, invalid
credential — both "no connection" and "connection not `CONNECTED`"), Authorization
(unauthenticated, non-member, forbidden role), Account selection (valid, duplicate/idempotent,
unknown Meta account, malicious/empty external ID, account belonging to another workspace,
multiple accounts, reselect-after-deselect, deselection), Tenant isolation (list + delete),
Security (token never returned/logged, raw provider error never exposed), Concurrency
(simultaneous selection of the same new account → one row; simultaneous selection of the same
external ID across two workspaces → two independent rows). Full regression: **191 integration
tests / 69 unit tests / 6 E2E tests**, all passing — zero regressions against the pre-existing
Phase 3.1 (152) and identity/workspace (rest) suites.

## 11. CI-Caught Concurrency Defect (found and fixed after the first push)

**What happened.** The implementation commit's first CI run failed one test:
`[concurrency] simultaneous selection of the same new account creates exactly one row`
(`AssertionError: expected [500, 200] to deeply equal [200, 200]`) — this test passed
consistently in five local re-runs but genuinely raced on CI's runner, whose timing made the
two concurrent transactions truly overlap in a way local runs did not reproduce.

**Root cause.** `selectAdAccounts` originally caught only Prisma's `P2002` (unique-constraint
violation) around the `create()` call specifically, to handle two concurrent first-time
selections racing to create the same row. Under genuine concurrent load, Postgres/Prisma can
instead raise **`P2034`** — "Transaction failed due to a write conflict or a deadlock" — which
is not scoped to a single statement and is not caught by a narrow try/catch around one call
within the transaction; it can surface at any point during, or at commit of, the interactive
transaction. Prisma's own documented mitigation for `P2034` is to retry the whole transaction
(confirmed via Prisma's official docs/GitHub discussion of this exact error code).

**Fix.** Replaced the single-statement `P2002` catch with `withConflictRetry()` — a bounded
(5-attempt) wrapper around the _entire_ `prisma.$transaction(...)` call, retrying on either
`P2002` or `P2034`. Each retry re-reads `existing` fresh, so a concurrent writer that won a
race is simply found and updated cleanly on the next attempt — no special-cased branch is
needed for "the other request created it first" versus "the other request updated it first."
`deselectAdAccount` was left unchanged — it is a targeted single-row update by internal ID
with no create-path, so it has no equivalent race to guard against.

**Verification.** Typecheck/lint clean; the concurrency tests re-ran 5/5 locally (this bug
was never locally reproducible, consistent with it being a genuine timing-dependent CI
condition, not a logic error the existing local run would have caught); the full suite
(191 integration / 69 unit) re-ran green; pushed as a second commit, which is the CI run
recorded in §14/§17 below.

## 12. Security Verification

- `pnpm audit --prod`: no known vulnerabilities.
- `gitleaks` (working-tree diff scan): no leaks. The 5 findings in a full-history scan are
  pre-existing, already-documented Phase 2.1/2.2 false positives, untouched by this phase.
- Token/credential handling: identical to Phase 3.1 — the access token is decrypted only
  inside the route handler immediately before an adapter call, never logged, never returned in
  any response, never stored in an `AdAccount` row (only non-credential display fields are
  persisted).
- Lint/format/typecheck: all clean, zero warnings introduced.

## 13. Real UAT

Performed against the real, currently-authorized Meta Development-mode connection (reconnected
this phase after Phase 3.1's UAT had left it `DISCONNECTED` — a real, second OAuth round-trip,
audited as `connectionVersion` 2→3). Workspace `35bca089-1415-4580-8d5c-b92a4ba16d49`
("Phase 2.3 UAT Workspace").

| Item                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Meta connection appears                         | Yes — reconnected, `CONNECTED`, real `externalUserId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Business discovery returns real accessible businesses    | Yes — 1 real Business returned, correctly normalized                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Ad account discovery returns real accessible ad accounts | Yes — 1 real Ad Account returned (currency `INR`, timezone `Asia/Kolkata`, `accountStatus: ACTIVE`, no Business association — a directly-shared account, correctly normalized as such)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Pagination                                               | Not independently exercisable in real UAT (only 1 page of real data exists) — fully covered by mocked multi-page tests (§10); the single-page real path is itself confirmed working                                                                                                                                                                                                                                                                                                                                                                                                         |
| Account metadata normalized correctly                    | Yes — real values matched exactly what the real Meta API returned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| User can select one ad account                           | Yes — real selection, real row persisted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| User can select multiple ad accounts                     | Not independently exercisable with 2+ real distinct accounts (only 1 exists in this Development-mode setup) — fully covered by mocked multi-account tests (§10); the single-account real path is itself confirmed working                                                                                                                                                                                                                                                                                                                                                                   |
| Selected accounts appear under the correct workspace     | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Another workspace cannot access them                     | Yes — real second workspace (`3651db79-...`) saw 0 accounts; a real cross-workspace `DELETE` returned `404`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Deselection works                                        | Yes — real deselection, `status` → `DESELECTED`, row preserved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Reselection reactivates the same row                     | Yes — real re-selection after deselection reused the same internal `id`, cleared `deselectedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| No credentials appear in UI/network responses            | Yes — every response inspected contained only safe fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Provider failures are handled safely                     | A real failure did occur (a reconnect attempt's OAuth `state` expired mid-flow during browser-automation troubleshooting, unrelated to discovery code) — the real callback correctly rejected it as `invalid_state`, audited safely, no corrupted state; discovery-specific real-UAT of a genuine Meta-side 4xx/5xx was not separately triggered live (impractical to induce safely against the real, working Development app) but is thoroughly covered by mocked integration tests (§10) using the exact same code path (`classifyMetaApiFailure`) already proven live in Phase 3.1's UAT |

## 14. CI

Verification suite run locally before commit: lint, format, typecheck (16/16 packages), unit
(69/69), integration (191/191), `apps/api`/workers builds (clean), E2E (6/6), `pnpm audit`
(clean), `gitleaks` (clean on the diff). `apps/web`'s production build has the same
pre-existing, Windows-local-only `EPERM: symlink` limitation already documented in
`phase-3-1-implementation-report.md` §16 — unrelated to this phase's changes (`apps/web` was
not touched; compilation and static-page generation both succeed, only the standalone-output
trace-copy step fails, a well-known Windows Developer-Mode/symlink-privilege requirement that
does not occur on CI's Linux runners).

CI run URL and commit SHA: recorded in this report's closing "record final green CI run"
commit, per this project's established two-commit pattern (see the git history for the exact
commits).

## 15. Migrations

One migration, `20260910170731_ad_account_discovery` — creates `ad_accounts` and the
`AdAccountSelectionStatus` enum, adds a unique index on `(workspace_id, external_id)`, indexes
on `(workspace_id, status)` and `meta_connection_id`, and cascading foreign keys to
`workspaces`/`meta_connections`. `prisma migrate status` confirms clean before and after. Per
Phase 3.1's own established practice, a local `prisma migrate reset` was not run (Prisma's own
AI-agent safety guard requires explicit human consent for that genuinely destructive action,
consistent with this session's standing practice around destructive operations) — CI's
`prisma migrate deploy` against a freshly-created Postgres service container remains the
authoritative clean-database verification for this migration too.

## 16. Files Changed

- `packages/domain/prisma/schema.prisma` — `AdAccount` model, `AdAccountSelectionStatus` enum,
  `Workspace.adAccounts`/`MetaConnection.adAccounts` relations.
- `packages/domain/prisma/migrations/20260910170731_ad_account_discovery/` — new migration.
- `packages/domain/src/meta/ad-accounts.ts` (new) — `listAdAccountsByWorkspace`,
  `findAdAccountByWorkspace`, `selectAdAccounts`, `deselectAdAccount`.
- `packages/domain/src/meta/errors.ts` — `AdAccountNotFoundError`,
  `AdAccountNotDiscoverableError`.
- `packages/domain/src/meta/index.ts`, `packages/domain/src/index.ts` — exports.
- `packages/contracts/src/meta.ts`, `packages/contracts/src/index.ts` — discovery/selection/
  persisted-list response schemas.
- `apps/api/src/plugins/meta-client.ts` — `listBusinesses`, `listAdAccounts`,
  `fetchAllPages` (pagination), `normalizeAccountStatus`.
- `apps/api/src/routes/meta.ts` — the 5 new routes, `resolveDiscoveryConnection`,
  `sendDiscoveryPrereqFailure`, `sendMetaApiFailure`, `toAdAccountSummary`.
- `tests/integration/api-meta-discovery.test.ts` (new) — 39 tests.

No unrelated files changed.

## 17. Commit SHA

Recorded in the closing "record final green CI run" commit (see git history) — the
implementation commit's own SHA and this report's final CI run URL are both filled in there,
matching Phase 3.1's established two-commit pattern.

## 18. Known Limitations

- **OD-3A-08's workspace-level Meta connection kill switch remains outstanding** (§1) — not
  built by this phase, must land before any future phase enables production mutation
  capability.
- Real UAT could not independently exercise pagination or multi-account selection against
  genuinely distinct real Meta resources, since only one real Business and one real Ad Account
  exist in the connected Development-mode account — both are thoroughly covered by mocked
  integration tests exercising the identical code paths.
- No separate `Business` table — Business display metadata is denormalized onto `AdAccount`
  only; a future phase that needs richer Business-level metadata (beyond id/name/
  verification-status-at-discovery-time) would need its own schema work.
- `lastSyncedAt` exists on `AdAccount` but is never written by this phase — Phase 4.1's sync
  worker is the first writer, per `meta-sync.md` §1.
- No campaign/ad-set/ad synchronization, Insights, webhooks, campaign creation/mutation,
  budget changes, AI Meta tools, or autonomous optimization — all explicitly out of this
  phase's scope (Phase 4/5/AI-tool-phase).

## 19. Phase 4 Readiness

Phase 4.1 (Campaign/Ad Set/Ad Synchronization) can build directly on the `AdAccount` model
(its `id` is the stable internal reference every synced Campaign row will carry as a parent
foreign key) without schema rework. The still-outstanding OD-3A-08 kill switch should be
built before Phase 4 enables any mutation capability, per its own binding decision text — this
is a recommendation for whichever phase first introduces mutation, not a hard gate on Phase
4.1's read-only sync work specifically.

## 20. Final Gate Status

**Implementation: complete.** **Tests: 191 integration + 69 unit + 6 E2E, all passing, zero
regressions.** **Real Meta UAT: complete and verified** (§13). **CI: green** (§14, SHAs
recorded in the closing commit — after one real concurrency defect was found and fixed,
§11). **Migrations: clean, CI-verified from a fresh database** (§15). **Docs: updated**
(`meta-account-discovery.md`, `meta-resource-model.md`, `meta-adapter-contract.md`,
`meta-api-contracts.md`, `meta-test-matrix.md`, `phase-3-implementation-sequence.md`, this
report). **Git: clean** — no unrelated files changed, no credential committed. **One
explicit, owner-acknowledged carry-forward item**: OD-3A-08's kill switch (§18). Phase 3.2
(Business & Ad Account Discovery) is **APPROVED FOR
CLOSURE**. Per this task's explicit instruction, **Phase 4 is not started**.
