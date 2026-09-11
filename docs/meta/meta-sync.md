# Meta Synchronization Architecture

**Document ID:** META-112 | Version 1.1 | Status: Implemented and real-UAT-verified 2026-09-11 (Phase 4.1) | Phase: 3A (Architecture Finalization, closed); Phase 4.1 (Implementation, complete)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_RETRY_AND_FAILURE.md`
(META-007) and `ai-marketing-manager-gate-2-docs/docs/03-architecture/WORKER_ARCHITECTURE.md`
(ARCH-005)'s Sync/Insights worker responsibilities against this project's already-shipped
worker infrastructure. Conceptual only — no worker code, migration, or queue change (as of
Phase 3A).

## 0. Implementation Status (Phase 4.1, 2026-09-11)

Implemented as designed below, with these Phase 4.1 implementation decisions: workspace/ad-
account-scoped locking (§6) uses a Postgres advisory lock guarding a short check-then-insert
against the `MetaSyncRun` table, not one long transaction spanning the whole sync pass (a
transaction held open across many slow external Meta API calls would itself become a
concurrency bug — pool exhaustion under load); `MetaSyncRun` (not named in this document, but
required to satisfy §4's "every item must have an explicit outcome") is the durable per-pass
outcome record. See `phase-4-1-implementation-report.md` for the full implementation record,
real Meta documentation re-verification, and real UAT results.

## 1. Synchronization Lifecycle (from the governing task, unchanged in shape)

```
OAuth (meta-oauth.md)
  ↓
Account discovery (meta-account-discovery.md)
  ↓
Account selection
  ↓
Initial sync            — full pull of the selected account's campaign hierarchy (meta-resource-model.md)
  ↓
Incremental sync        — subsequent scheduled passes, pulling only what changed since last_synced_at
  ↓
Webhook updates (where available — meta-webhooks.md; live-verified this pass: Meta's Ad
                 Account webhook topics cover only 5 specific conditions, not generic
                 campaign/ad-set CRUD change events — incremental sync remains the primary
                 mechanism, webhooks are a freshness accelerator, not a replacement)
  ↓
Periodic reconciliation — mirrors this project's already-shipped identity reconciliation
                           pattern (workers/webhook's reconcile.ts): webhooks/incremental sync
                           complement, never replace, a periodic full reconciliation pass
```

## 2. Worker Reuse (confirmed, no new worker infrastructure)

Reuses `packages/queue` (BullMQ) and `docs/identity/worker-authorization-contract.md`'s
canonical job field set unchanged: `workspaceId`, `initiatingActor`/`SystemActorContext` (a
scheduled sync is system-triggered — this is exactly the case
`packages/domain/src/identity/system-actor.ts`'s already-shipped `SystemActorContext` +
`assertSystemActorProvisioned()` was built for, per Phase 2.4's OD-2.4A-01 amendment),
`resourceScope` (the specific ad account/campaign scope a sync job covers), `actionScope`,
`correlationId`, `jobId`, `idempotencyKey`, `retryMetadata`. `workers/sync` and
`workers/insights` (already-scaffolded, empty placeholder packages — confirmed by direct
inspection) are the natural homes for this logic in Phase 4.1/4.2 — no new worker package is
proposed.

## 3. Sync Frequency, Cursor Handling, Checkpointing

**Owner-decided 2026-09-10 (OD-3A-06):** 30-minute incremental sync interval, as an
engineering default, configurable — not a permanent business/SLA commitment, and may be tuned
once real usage patterns and Meta's observed rate-limit headroom are known
(`meta-rate-limits.md` §2). An explicit user-triggered refresh path (`POST /workspaces/:id/
meta/sync`, `meta-api-contracts.md` §1) is required in addition to the scheduled interval, not
as a replacement for it. Structural requirement, unchanged: every sync job tracks a cursor/
checkpoint so a partial or interrupted run can resume rather than restart, and checkpoint
state is workspace-and-ad-account-scoped (never a single global cursor spanning multiple
tenants).

## 4. Retry, Idempotency, Partial Failure (from META-007, unchanged)

Retry only transient/network/appropriate-rate-limit failures — never blindly retry invalid
credentials, permission denial, or validation errors (identical rule to
`meta-adapter-contract.md` §3, restated here for the worker layer specifically). Exponential
backoff with jitter, bounded attempts. Repeated failures for one specific account reduce
pressure on that account (back off further, surface a degraded state via
`meta-connection-health.md`) rather than continuing to hammer it. **For any bulk/multi-item
sync operation, every item must have an explicit outcome — succeeded, failed, skipped, or not
attempted. Never collapse partial execution into an undifferentiated "success."**

## 5. Deleted External Resources, Stale Data, Re-sync After Reconnect

A resource no longer returned by Meta during a sync pass is handled per
`meta-resource-model.md` §5 (soft lifecycle-status change, never a silent hard delete). Stale
data is surfaced per `meta-insights.md` §5's freshness model. A reconnection
(`meta-token-security.md` §5) triggers a fresh discovery pass (`meta-account-discovery.md` §4)
and a full re-sync of previously-connected accounts, reconciling anything that changed while
the connection was unhealthy — not merely resuming incremental sync from a stale checkpoint.

## 6. Concurrency

Workspace/ad-account-scoped locking prevents two concurrent sync jobs from racing on the same
account's data (from `WORKER_ARCHITECTURE.md`, unchanged) — the same pattern already
established for identity's owner-invariant concurrency safety (`SELECT ... FOR UPDATE` in
`packages/domain/src/identity/memberships.ts`), conceptually reused here, exact mechanism a
Phase 4.1 implementation decision.
