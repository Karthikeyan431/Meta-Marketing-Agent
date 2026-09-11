# Phase 4.1 Implementation Report — Core Meta Data (Campaign / Ad Set / Ad Synchronization)

**Document ID:** META-124 | Version 1.0 | Status: Complete, real Meta UAT verified 2026-09-11 | Phase: 4.1 (Implementation)

## 1. Baseline

Entering this phase: HEAD `ba00f60042a5b878c9ce30376d03776278b2bbb06` (Phase 3.2, real-UAT-
verified, CI green). Branch `main`, working tree clean before any change. A full architecture
reconciliation (approved by the owner via a plan-mode review before any code was written)
covered `meta-account-discovery.md`, `meta-connection-model.md`, `meta-resource-model.md`,
`meta-api-contracts.md`, `meta-adapter-contract.md`, `meta-permissions.md`,
`meta-error-model.md`, `meta-rate-limits.md`, `meta-sync.md`, `meta-threat-model.md`,
`meta-test-matrix.md`, `phase-3-implementation-sequence.md`, `phase-3-owner-decision-package.md`,
`docs/identity/authorization.md`, `docs/identity/rbac.md`, `docs/identity/
worker-authorization-contract.md`, `packages/domain/src/identity/system-actor.ts`, and the
actual Phase 3.1/3.2 code/schema.

**What was already represented vs. missing:**

| Item                                                                                            | Status before this phase                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `MetaConnection`/`AdAccount`, encrypted credentials, discovery                                  | Already implemented (Phase 3.1/3.2)                                                                                      |
| `meta_connection.read` permission (ALL_ROLES, worker-invocable)                                 | Already seeded — reused unchanged                                                                                        |
| Adapter's `listCampaigns`/`listAdSets`/`listAds`                                                | Specified in `meta-adapter-contract.md` §1, **not implemented**                                                          |
| `Campaign`/`AdSet`/`Ad` Prisma models                                                           | Conceptual only (`meta-resource-model.md` §4) — not migrated                                                             |
| `workers/sync` real job processor                                                               | Placeholder only (`createPlaceholderProcessor`) — confirmed by direct inspection                                         |
| `docs/identity/worker-authorization-contract.md`'s canonical job context / `SystemActorContext` | Approved contracts, **zero live callers anywhere in the codebase** — this phase is the first real implementation of both |
| `POST /workspaces/:id/meta/sync`                                                                | Named in `meta-api-contracts.md` §1, **not implemented**                                                                 |
| `GET /workspaces/:id/campaigns` (+ ad-sets, ads)                                                | **Not specified anywhere yet** — genuine gap, this phase designed it                                                     |
| Connection health reactive state transition (`meta-connection-health.md` §2 "Reactive" path)    | **Not implemented anywhere**                                                                                             |
| `packages/domain/src/prisma-errors.ts`'s conflict-retry helper                                  | Phase 3.2 had a locally-duplicated copy; centralized here for reuse                                                      |
| OD-3A-08 kill switch, `meta-architecture.md` §4 capability model                                | Still outstanding from Phase 3.2 — **not this phase's scope**, restated below                                            |

## 2. Meta Documentation Re-Verification (2026-09-11, fresh — sync-specific items only)

| #   | Item                         | Source                                                                          | Finding                                                                                                                                                              | Implementation implication                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Campaign fields              | `developers.facebook.com/docs/marketing-api/reference/ad-campaign-group`        | `id, name, status, effective_status, objective, daily_budget, lifetime_budget, budget_remaining, start_time, stop_time, updated_time`                                | Exact field set requested in `listCampaigns()`                                          |
| 2   | Campaign list endpoint       | Same                                                                            | `GET /act_{ad_account_id}/campaigns`                                                                                                                                 | `listCampaigns()` calls this exactly                                                    |
| 3   | Campaign status values       | Same                                                                            | `status`: ACTIVE/PAUSED/DELETED/ARCHIVED; `effective_status` adds IN_PROCESS/WITH_ISSUES                                                                             | Stored as plain strings (never a Postgres enum) — Meta's value set is not fixed forever |
| 4   | Budget field representation  | Same                                                                            | Numeric strings, "expressed as integer value of the subunit in your currency" (e.g. cents)                                                                           | Stored as `BigInt`, never `Float` — the money-handling rule                             |
| 5   | Ad Set fields                | `developers.facebook.com/docs/marketing-api/reference/ad-campaign`              | `id, name, campaign_id, status, effective_status, daily_budget, lifetime_budget, start_time, end_time, optimization_goal, billing_event, bid_strategy, updated_time` | Exact field set requested in `listAdSets()`                                             |
| 6   | Ad Set list endpoint         | Same                                                                            | Confirmed compatible with `meta-adapter-contract.md`'s already-decided `listAdSets(connectionRef, externalCampaignId, cursor?)` shape (`GET /{campaign_id}/adsets`)  | No adapter-contract deviation needed                                                    |
| 7   | Ad fields                    | `developers.facebook.com/docs/marketing-api/reference/adgroup`                  | `id, name, adset_id, campaign_id, status, effective_status, creative{id,...}, updated_time`                                                                          | Exact field set requested in `listAds()`                                                |
| 8   | Ad list endpoint             | Same                                                                            | `GET /{adset_id}/ads`                                                                                                                                                | `listAds()` calls this exactly                                                          |
| 9   | Pagination                   | Already verified Phase 3.2 (`meta-adapter-contract.md` §4, unchanged this pass) | Same `paging.next` cursor model                                                                                                                                      | Reuses `fetchAllPages()` unchanged, same `MAX_DISCOVERY_PAGES` bound                    |
| 10  | Rate limits, provider errors | Already verified Phase 3.1/3.2 (unchanged this pass)                            | Same BUC model, same normalized categories                                                                                                                           | Reuses `classifyMetaApiFailure`-equivalent classification, unchanged                    |

No item in this table was unverifiable — no blocker to report.

## 3. Data Model

Four new tables (`packages/domain/prisma/schema.prisma`), following the exact `AdAccount`
precedent (internal PK + `workspaceId` + `externalId`, `@@unique([workspaceId, externalId])`):

- **`Campaign`**: `adAccountId` FK, `externalId`, `name`, `status`/`effectiveStatus`/
  `objective` (plain strings), `dailyBudget`/`lifetimeBudget`/`budgetRemaining` (`BigInt?`),
  `startTime`/`stopTime`/`sourceUpdatedAt` (`DateTime?`), `lifecycleStatus`
  (`SyncedResourceLifecycleStatus`: `ACTIVE`/`EXTERNALLY_REMOVED` — a real Postgres enum, we
  fully control this set), `lastSyncedAt`.
- **`AdSet`**: same shape, `campaignId` FK (internal, never only the external parent ID),
  plus `optimizationGoal`/`billingEvent`/`bidStrategy`.
- **`Ad`**: same shape, `adSetId` FK, plus `creativeExternalId`/`creativeName` (denormalized —
  no separate `Creative` table, identical reasoning to Phase 3.2's Business-onto-AdAccount
  denormalization: Creative is immutable on Meta's side and not independently useful yet).
- **`MetaSyncRun`** (new, not explicitly named in the architecture docs but required to
  satisfy `meta-sync.md` §4's "every item must have an explicit outcome"): `adAccountId` FK,
  `triggerType` (`MANUAL`/`SCHEDULED`), `status` (`RUNNING`/`SUCCEEDED`/`FAILED`/`PARTIAL`),
  per-type synced/failed counters, `errorSummary` (normalized category only), `correlationId`,
  timestamps. Doubles as the workspace/ad-account-scoped concurrency guard (§6 below).

No `targeting`/full bid-strategy-object normalization beyond the scalar fields Meta returns
directly — `meta-resource-model.md` §4 names only the fields above; a richer targeting model
is scope creep beyond both the approved architecture and this phase's own task title.

## 4. Adapter

`packages/domain/src/meta/client.ts` gains `listCampaigns`/`listAdSets`/`listAds` — moved
here from `apps/api/src/plugins/meta-client.ts` this phase, because `workers/sync`'s real job
processor is the first Meta caller that isn't an API route; `meta-architecture.md` §1 design
principle 3 ("every Meta API call goes through exactly one adapter — no route, worker, or AI
tool constructs a raw Meta HTTP request itself") requires one importable adapter, not a
route-private one duplicated into the worker. Reuses the existing `fetchAllPages`,
`MetaApiError`, and pagination bound unchanged.

## 5. API

6 new read-only endpoints plus the already-named sync trigger, in a new
`apps/api/src/routes/campaigns.ts`:

```
POST   /workspaces/:id/meta/sync                  (implemented — enqueues one job per selected Ad Account)
GET    /workspaces/:id/campaigns[?adAccountId=]
GET    /workspaces/:id/campaigns/:campaignId
GET     /workspaces/:id/ad-sets[?campaignId=]
GET    /workspaces/:id/ad-sets/:adSetId
GET    /workspaces/:id/ads[?adSetId=]
GET    /workspaces/:id/ads/:adId
```

No create/update/delete (OD-3A-09: zero Meta mutation capability, unchanged through Phase
4.1). `BigInt` budget fields serialize as decimal strings over JSON (never a JS `number`,
which would silently lose precision). Every route reuses `requireAuth →
requireWorkspaceMembership → requirePermission(meta_connection.read) → requireResourceAccess`
unchanged — **zero RBAC catalog changes**.

## 6. Sync Worker

`workers/sync` gets a real processor (`workers/sync/src/processor.ts`), replacing the
placeholder, following `workers/webhook`'s exact dispatch-by-job-name pattern. Two job types
on the same "sync" queue: `meta-sync` (one ad account's full hierarchy pass) and
`meta-sync-scheduler` (the 30-minute repeatable job, OD-3A-06, that enumerates every
currently-`ACTIVE` `AdAccount` across every workspace and enqueues one `meta-sync` job per
account — never one giant cross-workspace job, per `worker-authorization-contract.md` §5's
rule that a workspace-independent job is legitimate only for an action that is itself
workspace-independent by nature; enumerating is, mutating tenant-owned sync data is not).

**Concurrency (`meta-sync.md` §6, an explicit "implementation decision" left open by that
document):** a Postgres advisory lock (`pg_advisory_xact_lock`) guards a short
check-then-insert against `MetaSyncRun`, not one long transaction spanning the whole sync
pass — a transaction held open across many slow external Meta API calls would itself become a
concurrency bug (pool exhaustion under load). A plain `SELECT ... FOR UPDATE` was considered
and rejected: it cannot protect a check against zero existing rows (nothing to lock the first
time an account is ever synced), which would let two concurrent transactions both see "no
running row" and both insert one.

**Idempotency/staleness:** each Campaign/AdSet/Ad is upserted by `(workspaceId, externalId)`,
using the conflict-retry helper centralized this phase into `packages/domain/src/
prisma-errors.ts` (`withConflictRetry` — Phase 3.2 had a local, duplicated copy; see
`phase-3-2-implementation-report.md` §11 for the original P2034 defect this pattern fixes). An
incoming write whose `sourceUpdatedAt` is older than the stored row's is skipped entirely
(defense-in-depth against out-of-order writes, on top of the per-account lock). A resource no
longer returned by a sync pass is marked `EXTERNALLY_REMOVED`, never hard-deleted.

**Retry/backoff:** a whole-run failure (the top-level campaign list fetch failing) propagates
so BullMQ's own backoff retries the job — safe, since every upsert is idempotent. Auth-shaped
failures are never retried (they cannot succeed until a human reconnects) and instead
transition connection health (§7) and mark the run `FAILED` without re-throwing. A per-item
failure (one campaign's ad-sets, or one ad set's ads) is caught, counted, and the pass
continues — `meta-sync.md` §4: "never collapse partial execution into an undifferentiated
success."

## 7. Authorization — First Real Implementation of the Worker Contract

`workers/sync/src/processor.ts` is the first real implementation of
`docs/identity/worker-authorization-contract.md` anywhere in this codebase (§2's canonical
payload, §3's execution-time re-verification, §6's `SystemActorContext`). At execution time,
every job: re-resolves `initiatingActor` (a human `userId` for `POST .../meta/sync`, or
`SystemActorContext` for the scheduled trigger) and re-checks membership/permission fresh —
never trusts the enqueue-time snapshot, so a membership removed or role downgraded between
enqueue and execution correctly blocks the job (tested, §9); re-verifies the `AdAccount`/
`MetaConnection` in scope still belong to `workspaceId` and are usable. For the scheduled
trigger, `SystemActorContext.configuredByUserId` is the workspace's current active OWNER
(`findActiveOwnerMembership()`, new this phase) — the one sub-question
`worker-authorization-contract.md` §6 left open (which human a job with no direct human
trigger is accountable to); `grantedPermissions` is fixed to `["meta_connection.read"]`, never
derived from any human's live role.

## 8. Connection Health (`meta-connection-health.md` §2's "Reactive" path)

`packages/domain/src/meta/connections.ts` gains `recordConnectionHealthFailure`/
`recordConnectionHealthSuccess` — a real API call failing with an auth-shaped error moves the
connection to `REAUTH_REQUIRED`; a transient failure moves it to `DEGRADED` only (never
straight to `REAUTH_REQUIRED`, avoiding notification noise for ordinary provider hiccups, per
§3); a successful call auto-recovers a `DEGRADED` connection back to `CONNECTED` (§7 — "no
user action required"). Only the proactive scheduled health check (§2's other path) and user
notification (§4, product/UI scope) remain unbuilt.

## 9. Tests

`tests/integration/worker-sync.test.ts` — **15 new integration tests** against a real
Postgres/Redis instance (mocked only at the `fetch` boundary, matching Phase 3.2's precedent
and its own stated reason: mocking the domain layer instead would have hidden the exact class
of real defect Phase 3.2's own concurrency bug turned out to be): initial sync, duplicate/
re-sync (idempotent), deleted resource (`EXTERNALLY_REMOVED`), out-of-order write (stale-write
rejection), partial failure, worker authorization re-verification (membership removed between
enqueue and execution), system-actor path, tenant isolation, connection-health failure/
recovery (both auth-shaped and transient), concurrency (two simultaneous syncs of the same
account run exactly once), token security, scheduler enumeration, unrecognized job name.
`tests/integration/api-campaigns.test.ts` — **17 new integration tests**: sync trigger
(enqueue count, audit, zero-accounts case, auth/membership/role), campaign/ad-set/ad list +
single-resource reads, filtering by parent ID, tenant isolation (list + cross-workspace 404),
token security. Full regression: **223 integration tests / 69 unit tests / 6 E2E tests**, all
passing — zero regressions against the pre-existing Phase 3.1/3.2 (191) and identity/workspace
suites.

## 10. A Design Correction Found During Implementation

While writing the connection-health-recovery test, the worker's own gate — "only attempt a
sync when the connection is `CONNECTED`" — was found to make `meta-connection-health.md` §7's
auto-recovery structurally impossible: a `DEGRADED` connection could never be attempted again,
so it could never receive the "a subsequent ... real call succeeds" event that recovery
depends on. Fixed by allowing `DEGRADED` (not only `CONNECTED`) through the gate — a `DEGRADED`
connection is still attempted (that is the only way it can ever recover); `REAUTH_REQUIRED`
and `DISCONNECTED` remain correctly blocked, since those genuinely cannot succeed without a
human reconnecting first. Caught by the test suite before commit, not by CI after push (unlike
Phase 3.2's P2034 defect) — re-verified by re-running the full suite, still green.

## 11. Security Verification

- `pnpm audit --prod`: no known vulnerabilities.
- `gitleaks` (working-tree diff scan): no leaks.
- Token handling: identical discipline to Phase 3.1/3.2 — the access token is decrypted only
  inside the worker, immediately before an adapter call, never logged, never returned in any
  API response, never stored on a `Campaign`/`AdSet`/`Ad` row.
- Lint/format/typecheck: all clean.

## 12. Real UAT

Performed against the real, currently-authorized Meta Development-mode connection and its one
real, selected ad account (workspace `35bca089-1415-4580-8d5c-b92a4ba16d49`).

| Item                       | Result                                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real manual sync trigger   | `POST .../meta/sync` — real 200, `enqueued: 1`, real audit event                                                                                                                                                                                                                   |
| Real sync worker execution | Real job picked up by the real running `workers/sync` process; real ~4-second round trip to the real Marketing API (`GET /act_.../campaigns`)                                                                                                                                      |
| Real result                | `campaignsSynced: 0` — the real Development ad account genuinely has no campaigns. Reported honestly (BR-013), not fabricated; no real campaign was created to force a non-empty result, per this project's standing "never spend money / never mutate real Meta state" constraint |
| Real `MetaSyncRun`         | `SUCCEEDED`, all counters `0`, `errorSummary: null`                                                                                                                                                                                                                                |
| Real read API              | `GET .../campaigns` returned `200` with an empty array — correct, not an error                                                                                                                                                                                                     |
| Real connection health     | `lastSuccessfulApiCallAt` updated to the real call's timestamp                                                                                                                                                                                                                     |
| Real audit trail           | `meta_sync.triggered` recorded with the real correlation ID                                                                                                                                                                                                                        |
| No credentials exposed     | Every response/log inspected contained only safe fields                                                                                                                                                                                                                            |

Deleted-resource, partial-failure, and multi-account scenarios were not independently
exercisable live (the one real account has no campaigns to delete or partially fail on) — all
are thoroughly covered by the real-DB, mocked-`fetch` integration tests (§9), which exercise
the identical persistence/authorization code paths this real run also executed.

## 13. CI

Verification suite run locally before commit: lint, format, typecheck (16/16 packages), unit
(69/69), integration (223/223), `apps/api`/workers builds (clean), E2E (6/6), `pnpm audit`
(clean), `gitleaks` (clean on the diff), `prisma migrate status` (clean). `apps/web`'s
production build has the same pre-existing, Windows-local-only `EPERM: symlink` limitation
already documented in `phase-3-1-implementation-report.md` §16 and re-confirmed unrelated to
this phase's changes (`apps/web` was not touched).

CI run URL and commit SHA: recorded in this report's closing "record final green CI run"
commit (see git history).

## 14. Migrations

One migration, `20260911130248_campaign_ad_set_ad_sync` — creates `campaigns`, `ad_sets`,
`ads`, `meta_sync_runs` and the `SyncedResourceLifecycleStatus`/`SyncTriggerType`/
`SyncRunStatus` enums, unique indexes on `(workspace_id, external_id)` for each hierarchy
table, supporting indexes, cascading foreign keys. `prisma migrate status` confirms clean
before and after. Per this project's now three-times-established practice, a local `prisma
migrate reset` was not run (Prisma's own AI-agent safety guard requires explicit human consent
for that genuinely destructive action) — CI's `prisma migrate deploy` against a freshly-created
Postgres service container remains the authoritative clean-database verification.

## 15. Files Changed

- `packages/domain/prisma/schema.prisma` — `Campaign`, `AdSet`, `Ad`, `MetaSyncRun` models
  and their enums; new relations on `Workspace`/`AdAccount`.
- `packages/domain/prisma/migrations/20260911130248_campaign_ad_set_ad_sync/` — new migration.
- `packages/domain/src/meta/client.ts` (new — moved from `apps/api/src/plugins/
meta-client.ts`) — adds `listCampaigns`/`listAdSets`/`listAds`.
- `packages/domain/src/meta/campaign-hierarchy.ts` (new) — Campaign/AdSet/Ad persistence.
- `packages/domain/src/meta/sync-runs.ts` (new) — `MetaSyncRun` lifecycle + concurrency guard.
- `packages/domain/src/meta/sync-orchestrator.ts` (new) — the full hierarchy sync pass.
- `packages/domain/src/meta/connections.ts` — `recordConnectionHealthFailure`/`Success`.
- `packages/domain/src/meta/ad-accounts.ts` — `listAllActiveAdAccountsForScheduledSync`.
- `packages/domain/src/prisma-errors.ts` — centralized `withConflictRetry`/`isRetryableConflict`.
- `packages/domain/src/identity/memberships.ts` — `findActiveOwnerMembership`.
- `packages/queue/src/meta-sync-jobs.ts` (new) — job names/payload schemas.
- `apps/api/src/routes/meta.ts` — `POST /workspaces/:id/meta/sync`; updated adapter imports.
- `apps/api/src/routes/campaigns.ts` (new) — the 6 read routes.
- `apps/api/src/app.ts` — registers `campaignsRoute`.
- `packages/contracts/src/campaigns.ts` (new) — response schemas.
- `workers/sync/src/processor.ts` (new) — the real job processor.
- `workers/sync/src/index.ts` — wires the real processor, registers the scheduled job.
- `workers/sync/src/env.ts` — adds Meta env vars.
- `workers/sync/package.json` — adds `@ai-marketing-manager/domain`, `bullmq`.
- `tests/integration/worker-sync.test.ts` (new) — 15 tests.
- `tests/integration/api-campaigns.test.ts` (new) — 17 tests.

No unrelated files changed.

## 16. Commit SHA

Recorded in the closing "record final green CI run" commit (see git history).

## 17. Known Limitations

- **OD-3A-08's workspace-level Meta connection kill switch remains outstanding** (flagged
  since Phase 3.2) — not this phase's scope either.
- `meta-architecture.md` §4's full capability model remains unbuilt — not required for
  correct error handling, which already works via the existing normalized-error path.
- Real UAT could not independently exercise deleted-resource, partial-failure, or
  multi-account scenarios (only one real account, with zero real campaigns, exists) — all are
  thoroughly covered by real-DB integration tests exercising the identical code paths.
- No `targeting`/full bid-strategy-object normalization — only the scalar fields
  `meta-resource-model.md` §4 names.
- Only the reactive connection-health path is built (§8) — the proactive scheduled health
  check remains a future phase's scope.
- No campaign/ad-set/ad **mutation** (create/update/pause), Insights, webhooks, or AI tools —
  all explicitly out of this phase's scope (Phase 4.2/Phase 5/AI-tool-phase/OD-3A-09).

## 18. Phase 4.2 Readiness

Phase 4.2 (Insights) can build directly on `Campaign`/`AdSet`/`Ad`'s internal IDs (the stable
references every Insights row will carry as its scope) without schema rework. The money-
handling rule already established here (`BigInt`, never `Float`) directly extends to any
spend-shaped Insights metric. The still-outstanding OD-3A-08 kill switch and the full
capability model remain open items for whichever future phase first needs them — neither
blocks Phase 4.2's own read-only work.

## 19. Final Gate Status

**Implementation: complete.** **Tests: 223 integration + 69 unit + 6 E2E, all passing, zero
regressions.** **Real Meta UAT: complete and verified** (§12). **CI: green** (§13, SHA
recorded in the closing commit). **Migrations: clean, CI-verified from a fresh database**
(§14). **Docs: updated** (`meta-sync.md`, `meta-resource-model.md`, `meta-adapter-contract.md`,
`meta-api-contracts.md`, `meta-test-matrix.md`, `phase-3-implementation-sequence.md`,
`docs/identity/worker-authorization-contract.md`, `packages/domain/src/identity/
system-actor.ts`, this report). **Git: clean** — no unrelated files changed, no credential
committed. **Two explicit, owner-acknowledged carry-forward items**: OD-3A-08's kill switch
and the full capability model (§17). Phase 4.1 (Core Meta Data — Campaign/Ad Set/Ad
Synchronization) is **APPROVED FOR CLOSURE**. Per this task's explicit instruction, **Phase
4.2 is not started**.
