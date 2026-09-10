# Worker Authorization Contract

**Document ID:** IDENT-019 | Version 1.0 | Status: Approved (Owner Decision — see `phase-2-4a-decisions.md`) | Phase: 2.4A (Architecture Finalization)

Formalizes `authorization.md` §4 and §10 into a complete, implementation-ready contract for
every background job. **No new worker job type is implemented by this document** — the only
worker with real job processors today is `workers/webhook` (Clerk identity sync, Phase 2.3);
the other five (sync, insights, optimization, report, maintenance-beyond-its-example-job)
remain placeholder-only. This document exists so whichever phase implements their real job
processors does not re-derive this design.

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

## 6. Open Item: The Actor Identity Question for System-Triggered Jobs

`AUTONOMOUS_OPTIMIZATION.md`'s pipeline (Scheduler → ... → Execute) and any future
`sync`/`insights`/`optimization` worker job that runs on a schedule rather than as a direct
consequence of one specific user's request raise the same question `ai-authorization-
contract.md` §6 raises for autonomous AI actions: **what `initiatingActor` does a
system-triggered job carry?** Phase 2.3's `AuditActorType` enum already has `SYSTEM` and
`RECONCILIATION` variants precisely because this question was anticipated during Phase 2.3's
audit-schema design, even though no system-triggered _mutation_ job exists yet. This is not
resolved by this document — see `phase-2-4a-decisions.md`'s `OD-2.4A-01` (the same decision
item as the AI contract's open question — both share one root cause and should be decided
together, not independently). Does not block Phase 2.4 implementation (no autonomous or
scheduled mutation job exists yet); blocks whichever future phase builds one.
