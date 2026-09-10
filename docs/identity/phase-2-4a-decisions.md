# Phase 2.4A — Owner Decision Package

**Document ID:** IDENT-021 | Version 1.1 | Status: Owner-Reviewed, Amended | Phase: 2.4A (Architecture Finalization)

## Amendment (2026-09-10, post-Phase-2.4-implementation)

After Phase 2.4 was implemented, tested, and shipped (commit `966f0193c942ed68eb892a74590c897cf8b483a4`,
CI green) against this document's original recommendations — OD-2.4A-01 DEFERRED, OD-2.4A-03
NO AUTONOMOUS EXCEPTION — the owner issued new, superseding decisions for both items. **This
amendment records that reversal explicitly rather than silently overwriting the original
text.** OD-2.4A-02 and OD-2.4A-04 are unchanged. See each decision's own "Amended" block
below for the new text and what it does/does not require of Phase 2.4's already-shipped code.
Neither amendment required reopening Phase 2.4's OWNER-assignment fix, self-escalation
prevention, resource authorization, or audit implementation — those remain as shipped.

Mirrors the Phase 2A precedent (`phase-2a-owner-decision-package.md`) — this project's own
convention, not mandated by the upstream SDLC corpus (confirmed during Phase 2.4A research:
no governance document defines a canonical owner-decision-package format). Every decision
below is classified per the governing task's required taxonomy: **APPROVED**, **OWNER
DECISION REQUIRED**, **PROPOSED**, **DEFERRED**, **ENGINEERING DEFAULT**. Nothing here is
marked APPROVED merely because it seems technically sensible — APPROVED is used only for
decisions the owner has already made (in Phase 2A or Phase 2.3) that Phase 2.4A confirms
still hold, unchanged.

## Decisions Already Made (Phase 2A/2.3) — Confirmed Unchanged, Not Re-Opened

| Decision                                                          | Status                                | Confirmed by                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 roles (OWNER/ADMIN/MANAGER/ANALYST/VIEWER), no APPROVER role    | **APPROVED**                          | ADR-012; reconfirmed against the full security/product corpus in Phase 2.4A — no document anywhere requires or implies a distinct APPROVER role (see the four research forks' findings — "approver" appears only as a lowercase functional term/data-binding field, never a role name). |
| Approval is permission-based (`budget.approve`), not role-based   | **APPROVED**                          | ADR-012; `ACTION_APPROVAL_SECURITY.md`'s approval-binding record uses "approver" as a field, never a role.                                                                                                                                                                              |
| Membership permission overrides deferred, schema placeholder only | **APPROVED (unchanged)**              | ADR-019/OD-05 — not re-opened; no new requirement surfaced during Phase 2.4A research to justify building it now.                                                                                                                                                                       |
| Postgres RLS deferred to Phase 11                                 | **APPROVED (unchanged)**              | ADR-016/OD-04 — not re-opened.                                                                                                                                                                                                                                                          |
| Worker authorization context field set (base list)                | **APPROVED (extended, not replaced)** | ADR-023 — Phase 2.4A's `worker-authorization-contract.md` §2 merges this with `BACKGROUND_JOBS.md`'s superset list (adds `jobType`, `retryMetadata`, `idempotencyKey`); every field ADR-023 named remains required.                                                                     |
| AI authorization boundary ("AI is never the security boundary")   | **APPROVED (unchanged)**              | ADR-022 — Phase 2.4A's `ai-authorization-contract.md` formalizes, does not change, this.                                                                                                                                                                                                |

## New Decisions — This Phase

### OD-2.4A-01: Actor Identity for Autonomous / System-Triggered Actions

**Decision needed:** what `initiatingActor` does a future autonomous optimization run or
scheduled (non-human-request-triggered) mutation job carry, given neither has a natural
human actor the way every currently-implemented request does?

**Why it matters:** `ai-authorization-contract.md` §6 and `worker-authorization-contract.md`
§6 both hit this same gap — `AUTONOMOUS_OPTIMIZATION.md`'s pipeline begins from a
`Scheduler`, not a user. Every authorization primitive in this codebase currently assumes a
resolvable human `User`; nothing has been built (or needs to be built yet) for a
system-initiated mutation.

**Status:** **DEFERRED / PROPOSED default recorded.** Does not block Phase 2.4 implementation
(RBAC enforcement for human-initiated actions) — only blocks whichever future phase builds
`AUTONOMOUS_OPTIMIZATION.md`'s pipeline or a scheduled mutation-triggering worker. Recorded
now, with a recommendation, so that phase doesn't restart this analysis from zero.

**Options:**

1. **A workspace-scoped `SYSTEM` actor, accountable to the human who configured the
   triggering rule** — e.g. an autonomous optimization goal is created by an OWNER/ADMIN
   holding `ai.propose`+relevant mutation permissions at configuration time; every execution
   the rule later triggers records that configuring human as `initiatingActor` (an
   accountability chain, not a live re-check of their _current_ permission at each
   execution — see trade-off below).
2. **A pure system-level actor** with its own fixed, narrow, explicitly-provisioned
   permission set (distinct from any human's role), re-evaluated at each execution against a
   workspace-level "autonomous execution is enabled and configured with limits X/Y/Z" gate
   rather than any human's permissions.
3. **Require a human to re-authorize (approve) every individual autonomous execution** —
   eliminates the actor-identity question by eliminating true autonomy; likely conflicts
   with `AUTONOMOUS_OPTIMIZATION.md`'s and `BUSINESS_RULES.md` BR-005's stated design intent
   ("autonomous execution is disabled by default," implying it is expected to exist and run
   without a human in the loop once explicitly enabled).

**Recommendation:** Option 2, closest to what `AuditActorType.SYSTEM` (already implemented,
Phase 2.3) anticipated, combined with Option 1's accountability idea for audit purposes
(`AuditEvent.actorId` records the configuring human even when `actorType = SYSTEM`) — but
this is explicitly a recommendation for the future phase to ratify, not a decision Phase
2.4A makes now.

**Security impact if wrong:** high — an under-specified system actor could become a
standing, elevated, workspace-scanning privilege exactly opposite to the "AI never holds
standing privilege" principle. **Blocks:** whichever future phase implements autonomous
optimization or any scheduled (non-request-triggered) mutation worker. **Does not block:**
Phase 2.4.

**Amended (2026-09-10) — APPROVED.** The owner selected Option 2 + Option 1's accountability
idea (the recommendation above), ratified as a concrete contract rather than left as a
recommendation for a later phase to design from scratch: "Use an explicit system actor
identity for autonomous/system-triggered operations. System-triggered actions must remain
distinguishable from human user actions in authorization context and audit records. Do not
bypass the authorization chain." Implemented as `SystemActorContext` and
`assertSystemActorProvisioned()` in `packages/domain/src/identity/system-actor.ts` — a fixed,
narrow, explicitly-provisioned permission set per system actor (never derived from the
configuring human's live role), workspace-scoped, with the configuring human recorded for
accountability. **This is a type-level and validation-level contract only.** No code
currently constructs a `SystemActorContext` or calls `assertSystemActorProvisioned()` in a
live request/job path — no autonomous optimization pipeline or scheduled mutation worker
exists yet in this codebase (`workers/optimization` remains an empty scaffold). Wiring this
contract into a real execution path remains the responsibility of whichever future phase
builds that pipeline, per this decision's original "blocks" scope — unchanged by the
amendment.

### OD-2.4A-02: Worker Job Payload Signing

**Decision needed:** `RBAC_AUTHORIZATION.md`'s Background Jobs section calls for workers to
carry "a signed/validated execution context" — stronger than the plain-field job payload
context currently implemented (Phase 2.3's `ClerkWebhookEventPayload`/reconciliation job data
are plain BullMQ job data, not cryptographically signed).

**Status:** **OWNER DECISION REQUIRED**, but non-blocking for Phase 2.4 (no route or public
surface currently allows an attacker to submit an arbitrary job payload — jobs are enqueued
only by already-authorized, trusted, in-process application code).

**Options:**

1. **Keep plain-field context (current state), rely on execution-time re-verification**
   (`worker-authorization-contract.md` §3) as the actual security control, not the payload's
   own claims. Rationale: the job producer (application code) and consumer (worker process)
   both run inside the same trust boundary — Redis is not a publicly reachable service, and
   nothing in the current architecture lets an external actor inject or modify a job payload
   without first compromising a process that already has direct database access (at which
   point signing job payloads provides limited additional protection).
2. **Add HMAC-signed job payloads** (a shared secret between producers and the worker, or a
   per-job signature covering the authorization-context fields) as defense-in-depth against a
   compromised Redis instance or a malicious/buggy job producer.

**Recommendation:** Option 1 for Phase 2.4 — the re-verification-at-execution-time control
(`worker-authorization-contract.md` §3) already achieves the _outcome_ RBAC_AUTHORIZATION.md
is protecting against (a tampered payload cannot grant more authority than the actor
currently, actually holds, because the worker re-derives authority rather than trusting the
payload) without the operational cost of key management for job signing. Revisit if a future
phase ever exposes a job-submission surface to less-trusted producers (e.g. a public
webhook directly enqueuing privileged jobs without passing through application-layer
authorization first — not the current Phase 2.3 pattern, which always authorizes/persists
before enqueueing).

**Security impact:** moderate (defense-in-depth, not a currently-exploitable gap).
**Engineering impact:** signing would add key-management and producer/consumer coordination
overhead across every worker. **Blocks:** nothing in Phase 2.4 either way — recorded so the
choice is deliberate, not accidental.

### OD-2.4A-03: `campaign.pause` Worker-Invocability for Automated Guardrails

**Decision needed:** should a future automated guardrail (e.g. "pause this campaign when
budget is exhausted") ever be allowed to originate from a worker directly, or must every
`campaign.pause` — even a guardrail-triggered one — always route through a human's
`ai.propose`/approval chain first?

**Status:** **OWNER DECISION REQUIRED**, non-blocking for Phase 2.4 (no such worker exists
yet; `permission-catalog.md` flags this as the one genuinely open classification in the
permission taxonomy).

**Options:**

1. **No exception — every pause, even a guardrail-triggered one, is proposed by AI/system
   and requires human approval before executing**, consistent with `BUSINESS_RULES.md`
   BR-004's "mutating operations must pass ... any configured approval requirement" applying
   without carve-outs.
2. **A narrowly-scoped guardrail exception** — a workspace OWNER/ADMIN can pre-authorize a
   specific, bounded guardrail rule (e.g. "auto-pause on budget exhaustion, capped at N
   campaigns/day") at configuration time, and its resulting pause actions execute without a
   fresh per-event approval, but are still fully audited and reversible.

**Recommendation:** no recommendation given — this is a genuine product/risk-tolerance
question (how much autonomy a guardrail should have), not primarily a technical one; defer
to the owner's judgment when the guardrail feature itself is designed, not before.
**Security impact:** low either way if scoped tightly (a pause is reversible and
non-financial by itself). **Blocks:** whichever future phase implements automated campaign
guardrails.

**Amended (2026-09-10) — APPROVED, Option 2 (narrowly-scoped guardrail exception).**
"Worker execution of `campaign.pause` is allowed, but it must pass the same deterministic
authorization and financial/action guardrails as any other execution path. Workers must
never bypass permission checks, resource authorization, approval requirements, or audit
requirements." **This is a policy ratification only — no `campaign.pause` execution code
exists anywhere in this codebase to attach it to** (verified: no campaign domain, no worker
references `campaign.pause`). The decision closes `permission-catalog.md`'s previously "one
genuinely open classification" (see that document's `campaign.pause` row and footnote,
updated to reflect this) and gives whichever future phase implements the automated-guardrail
feature a settled answer instead of an open question: that worker MUST re-run the same
`requirePermission`-equivalent, fail-closed, execution-time checks §3 of
`worker-authorization-contract.md` already requires of every job — this decision authorizes
_that_ a guardrail worker may exist, not a bypass of any check a human-initiated
`campaign.pause` would otherwise go through.

### OD-2.4A-04: Formally Accept `ADR-002-AI-EXECUTION-BOUNDARY.md`'s Status

**Finding:** the gate-2 corpus document `ai-marketing-manager-gate-2-docs/docs/03-
architecture/ADR-002-AI-EXECUTION-BOUNDARY.md` ("AI Cannot Directly Access Meta APIs") is
still marked **Status: Proposed**, even though this project's own downstream documents
(`docs/identity/*`, this phase's `ai-authorization-contract.md`) treat its decision as
settled, binding architecture and have done so since Phase 2A. **Naming note:** this is a
_different document_ from this project's own `ARCHITECTURE_DECISION_REGISTER.md` ADR-002
("External auth + application RBAC," the Clerk vendor decision) — the two share a number
only by coincidence of two separate numbering systems (the original gate-corpus's per-gate
ADRs vs. this project's own consolidated register). Refer to the former by its full filename
to avoid confusion.

**Status:** **OWNER DECISION REQUIRED**, low-cost/low-controversy — this is a status-field
formality, not a substantive re-litigation.

**Recommendation:** formally accept `ADR-002-AI-EXECUTION-BOUNDARY.md` as-is (its actual
decision and rationale are unchanged and uncontested) — this decision package records the
owner's acceptance here rather than editing the original gate-corpus file (out of scope for
Claude Code to unilaterally mark "Accepted" on the owner's behalf, per the governing task's
explicit "do not mark owner decisions as approved without explicit owner approval").
**Blocks:** nothing functionally (the project has operated as if it were accepted since
Phase 2A) — this closes a documentation-consistency gap, not a security gap.

## Engineering Defaults (No Owner Decision Required — Conservative, Reversible, Already Implemented)

| Item                                          | Default                                                                                                         | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role model shape                              | Flat, enumerated capability matrix — not inheritance                                                            | Already implemented this way since Phase 2.3 (`rbac-catalog.ts`); required by the financial-separation carve-outs (§4/§6 of `rbac.md`), which a real hierarchy would fight against. See `rbac.md` §7.                                                                                                                                                                                                                                                                                                                                              |
| Runtime authorization caching                 | None — membership/role always a live DB query; role→permission a static in-process catalog, not a runtime cache | The conservative, zero-staleness-risk choice; introducing a cache would be the decision requiring owner sign-off, not declining to add one. See `authorization.md` §8.                                                                                                                                                                                                                                                                                                                                                                             |
| `changeMembershipRole()` OWNER-assignment gap | Must be closed before any member-management route ships — reject `newRole === "OWNER"` unconditionally          | Not a design choice with legitimate alternatives — a straightforward security-correctness requirement identified during this review. See `rbac.md` §8.2. Binding for Phase 2.4 implementation.                                                                                                                                                                                                                                                                                                                                                     |
| Permission key naming convention              | Dot-style (`resource.action`, e.g. `campaign.update`) is canonical                                              | Matches the already-implemented, tested, seeded 27-permission catalog; `AI_TOOL_CONTRACT.md`'s colon-style example (`insights:read`) is illustrative prose from an earlier corpus document, not a competing implementation.                                                                                                                                                                                                                                                                                                                        |
| Session rotation on role/permission change    | Not implemented; not required for correctness                                                                   | `AUTHENTICATION_AND_SESSION.md` lists this as a session hygiene recommendation, but this codebase's zero-caching design (every request re-derives role/permission from the database) already gives a role change immediate effect on the next request — session rotation would only add defense-in-depth against an already-narrow scenario (a stolen-but-still-valid Clerk session token used within the same request-authorization window), not close a correctness gap. Revisit only if a future threat-model update specifically motivates it. |

## Decisions Explicitly NOT Re-Opened

Per the Hard Restrictions, this phase does not revisit: the 5-role set, the 27-permission
catalog's contents (only its metadata is extended, in `permission-catalog.md` — no
permission added/removed/reassigned), the owner-invariant rule, RLS deferral, or membership
override deferral. Any apparent tension with these (e.g. `SCHEMA_DESIGN.md`'s `approvals`
table having an `approver` _column_ — a field name, not a role) was checked during research
and found not to be a genuine conflict — see the four Phase 2.4A research summaries folded
into `rbac.md` §7–§9, `permission-catalog.md`, `ai-authorization-contract.md`, and
`worker-authorization-contract.md` above.
