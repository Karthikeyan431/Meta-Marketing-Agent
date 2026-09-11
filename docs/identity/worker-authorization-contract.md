# Worker Authorization Contract

**Document ID:** IDENT-019 | Version 1.2 | Status: Approved (Owner Decision — see `phase-2-4a-decisions.md`); §2/§3/§6 implemented and real-caller-verified 2026-09-11 (Phase 4.1) | Phase: 2.4A (Architecture Finalization), amended Phase 2.4; implemented Phase 4.1

Formalizes `authorization.md` §4 and §10 into a complete, implementation-ready contract for
every background job. **No new worker job type was implemented by this document itself** — as
of Phase 2.4A/2.4, the only worker with real job processors was `workers/webhook` (Clerk
identity sync, Phase 2.3); the other five (sync, insights, optimization, report,
maintenance-beyond-its-example-job) were placeholder-only. This document existed so whichever
phase implemented their real job processors would not re-derive this design.

**Phase 4.1 (2026-09-11) is that phase, for `workers/sync`.** `workers/sync/src/processor.ts`
implements this contract's full canonical job payload (§2), execution-time re-verification
(§3 — re-resolving `initiatingActor`, re-checking membership/permission, re-verifying the
`AdAccount`/`MetaConnection` in `resourceScope`, all fresh at execution time, never trusting
the enqueue-time snapshot), and is the first real caller of `SystemActorContext`/
`assertSystemActorProvisioned()` (§6) for the scheduled trigger — `configuredByUserId` is
derived from the workspace's current active OWNER at execution time, a Phase 4.1
implementation decision for the one sub-question §6 itself left open (which specific human a
system-triggered job with no direct human trigger is accountable to). See
`phase-4-1-implementation-report.md` §8 for the full implementation record and its own real
integration tests exercising §4's revocation/retry table (membership removed between enqueue
and execution) against a real job, not a mocked one.

## 1. The Non-Negotiable Principle (restated, not re-decided)

> A background worker never runs with an ambient "internal, therefore trusted" privilege.
> Every job payload carries an explicit, **verified** workspace scope ... the worker
> re-derives/re-checks the workspace relationship of every resource it touches using the
> same `requireResourceAccess()`-shaped query, not a bespoke internal-only code path.
> — `authorization.md` §4

## 2. The Canonical Job Authorization Context — merged field set

The governing task's "approved worker authorization context" list
(`workspaceId, initiatingUserId/actor, resource scope, action scope, correlationId, jobId`)
and `BACKGROUND_JOBS.md`'s independently-specified list (`job ID, job type, workspace,
initiating actor/system identity, correlation ID, resource scope, retry metadata,
idempotency key`) are a superset relationship, not a conflict. **Canonical merged field set
for every job payload, effective Phase 2.4A:**

| Field             |  Required   | Notes                                                                                                                                                                                                                                                                                       |
| ----------------- | :---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobId`           |     Yes     | BullMQ's own job ID — already present on every job today.                                                                                                                                                                                                                                   |
| `jobType`         |     Yes     | The specific job name within a queue (`BACKGROUND_JOBS.md`'s addition) — Phase 2.3 already does this (`CLERK_WEBHOOK_EVENT_JOB_NAME`, `CLERK_RECONCILIATION_JOB_NAME`).                                                                                                                     |
| `workspaceId`     | Conditional | Required for every job that touches workspace-owned data; a genuinely workspace-independent job (e.g. Phase 2.3's identity reconciliation, which spans all workspaces by design) is the documented exception — see §5.                                                                      |
| `initiatingActor` |     Yes     | Either a human `userId` (a job enqueued as a direct consequence of a user's authorized request) or an explicit non-human actor identity — see §6 for the system-actor question this raises.                                                                                                 |
| `resourceScope`   | Conditional | The specific resource(s) the job is authorized to touch, when narrower than the whole workspace (e.g. "this one campaign," not "anything in this workspace").                                                                                                                               |
| `actionScope`     |     Yes     | What class of mutation this job is authorized to perform — never inferred from `jobType` alone at execution time; carried explicitly so a compromised/tampered payload can't silently widen scope by only changing `jobType`.                                                               |
| `correlationId`   |     Yes     | Propagated from the request/session that triggered the job, ties the job to the human-facing `AuditEvent` trail that authorized it.                                                                                                                                                         |
| `idempotencyKey`  | Conditional | Required for any job whose effect must not double-apply on retry beyond BullMQ's own at-least-once semantics (e.g. a financial execution job, once those exist) — `IDEMPOTENCY_CONCURRENCY.md`'s "reused key with different parameters must fail" rule applies identically to job payloads. |
| `retryMetadata`   |  Implicit   | BullMQ's own `attemptsMade`/`opts.attempts` — already used by Phase 2.3's webhook worker to distinguish "still retrying" from "exhausted, mark FAILED" (`workers/webhook/src/index.ts`'s `worker.on("failed", ...)` handler).                                                               |

**Never accepted:** a job payload field asserting a permission, role, or "already
authorized: true" flag of any kind — a worker re-derives authorization from `workspaceId` +
`initiatingActor` at execution time exactly as an API route would, never trusts a payload's
own claim about what it's allowed to do (`TENANT_ISOLATION.md` rule #5: "background jobs must
carry verified workspace scope," not an unverified self-assertion).

## 3. Verification at Execution Time (not just at enqueue time)

A job's authorization context is established when it is enqueued by already-authorized code
(the enqueuing code path itself already ran the full `requireAuth()`→`requirePermission()`
chain for the triggering request). **The worker must not treat that as sufficient on its
own** — by the time a job actually executes, time has passed and the underlying grant may no
longer hold. At execution time, a worker that touches tenant-owned data must:

1. Re-resolve the `initiatingActor` against the current `User`/`WorkspaceMembership` state
   — not trust the payload's snapshot of who they were at enqueue time.
2. Re-run the equivalent of `requireWorkspaceMembership()` for `workspaceId` +
   `initiatingActor` — a removed membership, a workspace deleted since enqueue, or a role
   downgraded since enqueue must all cause the job to fail closed, not execute with stale
   authority.
3. Re-run `requireResourceAccess()`-shaped queries for every resource in `resourceScope` —
   identical mechanical rule as any API route (`authorization.md` §2), never a bespoke
   "worker context is trusted" shortcut.

This mirrors — and is the direct generalization of — the pattern Phase 2.3's reconciliation
job already follows for identity data itself (re-deriving current Clerk-side state rather
than trusting stale local assumptions), extended here to apply to every future job that acts
on behalf of a specific actor.

## 4. Behavior Under Revocation, Retry, and Deletion

| Scenario                                                                  | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initiatingActor`'s `User` was removed/soft-deleted since enqueue         | Fail closed — the job must not execute using a deleted user's authority. Log/audit as a failed-authorization outcome, not a generic error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `initiatingActor`'s membership in `workspaceId` was removed since enqueue | Fail closed, identically to a live API request from a since-removed member — §3 step 2 catches this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `initiatingActor`'s role changed (e.g. downgraded) since enqueue          | Re-check `requirePermission()` for `actionScope` against the **current** role, not the role at enqueue time — a downgrade must block the job exactly as it would block a fresh API request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspaceId` was deleted since enqueue                                   | Fail closed — no job may act on a deleted workspace's data regardless of what it was authorized to do when enqueued.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Job is retried (BullMQ's at-least-once delivery)                          | Each retry attempt **re-runs §3's verification from scratch** — a job that was authorized on attempt 1 but whose actor was revoked before attempt 2 must fail on attempt 2, not silently succeed using attempt-1's already-passed check. Retries that keep failing on authorization (as opposed to a transient infrastructure error) must not be retried indefinitely — `WORKER_ARCHITECTURE.md`: "do not retry permanent authorization/policy failures indefinitely." A worker must distinguish "transient — keep retrying per BullMQ's backoff" from "authorization/policy denial — stop retrying, mark failed, surface for audit" as two different exception types (Phase 2.3's `DeferredSyncError` vs. every other thrown error is the precedent for this distinction — extend that pattern, don't invent a new one). |

## 5. The Workspace-Independent Job Exception

Phase 2.3's identity reconciliation job (`workers/webhook/src/reconcile.ts`) is the one
already-implemented example of a job with no single `workspaceId` — it deliberately spans
every workspace by design (pulling all Clerk organizations/users/memberships in one pass).
Its `initiatingActor` is the `RECONCILIATION` `AuditActorType` (a non-human, system-level
actor, already implemented in Phase 2.3's `AuditEvent` schema) — this is the existing
precedent for §6's open question below, not a new decision.

**Rule:** a workspace-independent job is legitimate only when its action is itself
workspace-independent by nature (pulling/reconciling identity state that spans workspaces,
as opposed to mutating one workspace's tenant-owned resources) — a future job that mutates
campaign/budget/report data must always carry a specific `workspaceId`, never operate
"globally," regardless of how it's triggered.

## 6. The Actor Identity Question for System-Triggered Jobs (resolved 2026-09-10)

`AUTONOMOUS_OPTIMIZATION.md`'s pipeline (Scheduler → ... → Execute) and any future
`sync`/`insights`/`optimization` worker job that runs on a schedule rather than as a direct
consequence of one specific user's request raise the same question `ai-authorization-
contract.md` §6 raises for autonomous AI actions: **what `initiatingActor` does a
system-triggered job carry?** Phase 2.3's `AuditActorType` enum already has `SYSTEM` and
`RECONCILIATION` variants precisely because this question was anticipated during Phase 2.3's
audit-schema design, even though no system-triggered _mutation_ job exists yet.

**Resolved by OD-2.4A-01 (amended, approved 2026-09-10 — see `phase-2-4a-decisions.md`):**
a system-triggered job's `initiatingActor` is a `SystemActorContext`
(`packages/domain/src/identity/system-actor.ts`) — `{ workspaceId, systemActorId,
configuredByUserId, grantedPermissions }`. `assertSystemActorProvisioned()` enforces
fail-closed: a system actor with no explicitly-granted permissions has no authority, never
implicit/ambient authority. When a job's `initiatingActor` is a system actor rather than a
human `userId`, the audit trail records `actorType = SYSTEM` with `actorId = systemActorId`
(the existing descriptive-string precedent from `WEBHOOK`/`RECONCILIATION`, not the human's
`User.id` — keeps `SYSTEM` audit records structurally distinguishable from `USER` ones per
OD-2.4A-01's requirement) and `configuredByUserId` in the event's `metadata`, preserving the
accountability chain back to the human who configured the triggering rule.

**Still not implemented — this section resolves the contract, not a live execution path.**
No worker job today constructs a `SystemActorContext` or produces `actorType = SYSTEM` for a
mutation (Phase 2.3's `RECONCILIATION` actor remains the only non-human actor in real use,
and it is read/reconciliation-only per §5). §3's execution-time re-verification rules apply
identically once a real system-triggered job exists: re-derive authority from the current
`SystemActorContext`'s `grantedPermissions` at execution time, never trust a stale payload
snapshot. Blocks nothing further in Phase 2.4; whichever future phase builds the first real
autonomous/scheduled mutation job wires it through this now-settled contract.
