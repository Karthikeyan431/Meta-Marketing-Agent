# Phase 3 — Meta Integration Owner Decision Package

**Document ID:** META-119 | Version 1.1 | Status: Owner-Decided 2026-09-10 (OD-3A-05 remains OWNER POLICY OPEN — see below) | Phase: 3A (Architecture Finalization, closed)

Mirrors the established convention from `phase-2a-owner-decision-package.md` and
`phase-2-4a-decisions.md`. Nothing here is marked APPROVED merely because it seems technically
sensible — that classification is reserved for decisions the owner has already made in an
earlier phase that this phase confirms still hold, unchanged.

## Decisions Already Made — Confirmed Unchanged, Not Re-Opened

| Decision                                                                                                         | Status                   | Confirmed by                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta_connection.connect`/`meta_connection.reconnect` are never AI-invocable                                     | **APPROVED (unchanged)** | `docs/identity/permission-catalog.md`'s existing "Meta Connection" section (Phase 2.4A) — "OAuth-adjacent, credential-handling stays human-initiated." Restated in `meta-oauth.md` §7.                                                                                                     |
| `meta_connection.disconnect` is AI-proposable but never AI-auto-executed                                         | **APPROVED (unchanged)** | Same source, "With approval." Not re-opened.                                                                                                                                                                                                                                               |
| `meta_connection.read` is AI- and worker-invocable                                                               | **APPROVED (unchanged)** | Same source. Reused in `meta-api-contracts.md` §2's `POST /workspaces/:id/meta/sync` classification.                                                                                                                                                                                       |
| Application RBAC (5 roles, `meta_connection.*`/`campaign.*` permissions) is unchanged; no new role or permission | **APPROVED (unchanged)** | `packages/domain/src/rbac-catalog.ts`, already shipped, seeded, and tested since Phase 2.3/2.4A — this phase proposes zero catalog changes throughout `docs/meta/*`.                                                                                                                       |
| Postgres RLS remains deferred to Phase 11                                                                        | **APPROVED (unchanged)** | ADR-016/OD-04 — applies identically to Meta-owned tables once they exist; not re-opened here.                                                                                                                                                                                              |
| AI is never the security/authorization boundary for any Meta operation                                           | **APPROVED (unchanged)** | `docs/identity/ai-authorization-contract.md`, restated in `meta-threat-model.md` threat #20.                                                                                                                                                                                               |
| No autonomous Meta mutation actor exists or is being built                                                       | **APPROVED (unchanged)** | Consistent with Phase 2.4's OD-2.4A-01 amendment (`SystemActorContext` exists as a contract for a _future_ phase, has zero live callers) — Meta sync/insights jobs use it exactly as already specified in `docs/identity/worker-authorization-contract.md` §6, no Meta-specific extension. |

## New Decisions — This Phase

### OD-3A-01: Supported Meta Asset Scope for V1

**Decision needed:** which Meta assets V1 supports beyond Ad Accounts.

**Options:**

1. **Ad Accounts only** — no Business-level discovery, the user connects one directly-shared
   ad account per connection. Minimal permission scope (`ads_read`+`ads_management` only —
   see OD-3A-02).
2. **Businesses + Ad Accounts** — full discovery across a Business Manager, multiple ad
   accounts discoverable and selectable. Requires `business_management` (OD-3A-02).
3. Broader (Pages, pixels, catalogs) — explicitly not recommended; no product workflow in this
   project's roadmap currently requires them (`meta-account-discovery.md` §1).

**Recommendation:** Option 2, since most real advertisers manage ad accounts through a
Business Manager rather than a single directly-shared account, and the incremental
engineering cost (one more discovery call, one more permission) is small relative to Option 1's
narrower real-world applicability.

**Security impact:** Option 2 requires an additional App-Review-gated, Business-Verification-
gated permission (`business_management`) — a real, but already-anticipated, cost (`meta-
permissions.md` §1).
**Engineering impact:** Option 2 requires `meta-account-discovery.md`'s Business-scoped
discovery path; Option 1 skips it entirely.
**Operational/cost impact:** Business Verification (`meta-app-review.md` §5) has a real,
currently-unverified timeline — Option 2 makes this a launch-blocking dependency Option 1
would avoid.
**Blocking phase:** Phase 3.1 (permission scope depends on this) / Phase 3.3 (discovery
implementation depends on this).

**DECIDED (owner, 2026-09-10) — APPROVED: Option 2, Businesses + Ad Accounts.** Pages,
Pixels, Catalogs, and any other Meta asset family are explicitly excluded from V1 — not
merely deferred by omission, but a binding restriction. Any future phase wanting to add one
of these asset families must obtain its own explicit owner decision; it may not be inferred
as already in scope from this approval.

### OD-3A-02: Meta Permission Scope

**Decision needed:** exact permission set to request at App Review submission.

**Options:** (see `meta-permissions.md` §1–2 for the full matrix)

1. `ads_read` + `ads_management` only (+ their two required dependencies).
2. All three (`ads_read` + `ads_management` + `business_management` + dependencies) — required
   if OD-3A-01 selects Option 2.

**Recommendation:** directly follows OD-3A-01 — request exactly the permissions the selected
asset scope needs, never speculatively.

**Security impact:** each additional permission is additional App-Review-gated attack surface
and an additional thing that can be independently revoked (`meta-threat-model.md` threat #10).
**Engineering impact:** none beyond OD-3A-01's own.
**Operational/cost impact:** none beyond OD-3A-01's own.
**Blocking phase:** Phase 3.1.

**DECIDED (owner, 2026-09-10) — APPROVED: request only the minimum verified permissions
required for the approved Businesses + Ad Accounts advertising workflow** (per OD-3A-01,
this is `ads_read` + `ads_management` + `business_management`, plus their
`pages_read_engagement`/`pages_show_list` dependencies — `meta-permissions.md` §1). No
speculative permission may be requested. **The exact permission/dependency matrix in
`meta-permissions.md` §1 is retained as a Phase 3.1 verification requirement** — it must be
re-checked against current official Meta documentation immediately before the App Review
submission, not assumed still accurate from this phase's 2026-09-10 pass.

### OD-3A-03: Development vs. Production App Strategy

**Decision needed:** confirm the two-app (dev/prod), never-shared-credentials strategy
(`meta-app-review.md` §2) as binding, or specify an alternative.

**Recommendation:** confirm as specified — this is a security-necessary separation (§7 of
`meta-token-security.md`), not a discretionary choice with a meaningfully cheaper alternative.

**Security impact:** high if not followed (a shared app means a development bug or leaked
development credential has production blast radius).
**Engineering impact:** minor — two sets of environment variables, already anticipated by
`ENVIRONMENT_VARIABLES.md`'s existing "Meta" section.
**Operational/cost impact:** negligible — Meta apps are free to create.
**Blocking phase:** Phase 3.1.

**DECIDED (owner, 2026-09-10) — APPROVED: separate Meta development and production apps,
as specified.** Credentials must never be shared between them, per `meta-token-security.md`
§7 and `meta-app-review.md` §2, unchanged.

### OD-3A-04: Account Selection Behavior — Single vs. Multiple Ad Accounts per Workspace

**Decision needed:** may a workspace connect more than one ad account (under one or more Meta
Connections)?

**Options:**

1. **Single ad account per workspace** — simplest initial product surface.
2. **Multiple ad accounts, single Meta Connection** — one OAuth grant, several selected
   accounts under it.
3. **Multiple ad accounts across multiple Meta Connections** — a workspace could connect
   distinct Meta Business identities independently.

**Recommendation:** Option 2 for V1 — most workspaces will have exactly one relevant Business/
ad-account relationship, but supporting multiple selected accounts under one connection avoids
an artificial single-account limitation later; Option 3 (multiple independent Connections) is
real added complexity (`meta-connection-model.md` §4's uniqueness rule would need to allow
more than one active connection per workspace) that nothing in the current product scope
requires.

**Security impact:** none distinguishing the options — tenant isolation (`meta-resource-model.md`
§6) applies identically regardless of how many accounts a workspace connects.
**Engineering impact:** Option 3 is materially more schema/logic complexity than Option 2 for
no currently-identified product benefit.
**Operational/cost impact:** negligible.
**Blocking phase:** Phase 3.2/3.3.

**DECIDED (owner, 2026-09-10) — APPROVED: Option 2, multiple Ad Accounts may be selected
under a single Meta Connection.** Option 3 (multiple independent Meta Connections per
workspace) is explicitly not built for V1 — `meta-connection-model.md` §4's uniqueness rule
(one active connection identity per workspace) stands unless a real, approved product
requirement for multiple independent connections appears in a future phase.

### OD-3A-05: Token/Data Retention Policy After Disconnect

**Decision needed:** how long historical synced campaign/insights data is retained after a
workspace disconnects Meta, and how long the (now-inactive) credential reference is retained
before secure deletion.

**Options:**

1. Retain historical synced data indefinitely (subject to whatever general data-retention
   policy the project eventually adopts); delete the credential reference immediately on
   disconnect.
2. Retain both for a fixed window (e.g. 90 days) then purge, to bound storage/compliance
   exposure.

**Recommendation:** no recommendation given — this is a genuine data-retention/compliance
policy question the owner should set deliberately, not an engineering default. BR-018
("disconnecting must not silently delete required audit history") constrains any option: audit
records survive regardless of which retention policy is chosen for the underlying synced
campaign/insights data itself.

**Security impact:** longer retention of a disconnected-but-not-yet-purged credential
reference is a small additional attack-surface window; immediate deletion (part of both
options above) minimizes this regardless of the data-retention choice.
**Engineering impact:** Option 2 requires a scheduled purge job; Option 1 does not.
**Operational/cost impact:** Option 1 has unbounded storage growth over time; Option 2 bounds
it at the cost of the purge job's own complexity.
**Blocking phase:** Phase 3.2 (credential deletion) / a later phase for the data-retention
purge job specifically, if Option 2 is chosen.

**STATUS (owner, 2026-09-10) — OWNER POLICY REMAINS OPEN.** The historical-data retention
period (how long synced campaign/insights data is kept after disconnect) is explicitly **not**
decided by this closure — neither Option 1 nor Option 2 above is selected, and no specific
retention window (e.g. "90 days") is approved. **Do not invent or assume a retention period**
in any future phase without a separate, explicit owner decision.

Two narrower points **are** decided as binding engineering rules, independent of the
still-open retention-period question:

1. **Credential material must be revoked/deleted promptly on disconnect** — this is not
   contingent on the open retention-period policy; it already follows from
   `meta-token-security.md` §5's "secure deletion" rule and is now confirmed binding.
2. **Required audit history must never be silently deleted** — BR-018, already the governing
   rule in `meta-oauth.md` §6 and `meta-account-discovery.md` §4, confirmed binding here too.

Phase 3.2 must implement rules 1–2 above; it must **not** implement any data-retention purge
job or fixed retention window, since that specific policy remains open.

### OD-3A-06: Sync Frequency

**Decision needed:** how often incremental sync runs per connected account.

**Recommendation:** no recommendation given — this is a product/cost trade-off (more frequent
sync means fresher data and higher Meta API quota consumption per `meta-rate-limits.md`) best
set once real usage patterns and Meta's actual observed rate-limit headroom are known, closer
to Phase 4.1 implementation than at this architecture stage.

**Security impact:** none.
**Engineering impact:** none beyond what `meta-sync.md` §3 already specifies structurally
(cursor/checkpoint support, whatever the frequency).
**Operational/cost impact:** directly trades off against Meta API quota consumption
(`meta-rate-limits.md` §2).
**Blocking phase:** Phase 4.1.

**DECIDED (owner, 2026-09-10) — APPROVED AS ENGINEERING DEFAULT: 30-minute incremental sync
interval, configurable.** Explicitly a default, not a permanent business/SLA commitment — may
be tuned once real usage patterns and Meta's observed rate-limit headroom are known
(`meta-rate-limits.md` §2), without requiring a fresh owner decision to change the number
itself. Additionally required: an **explicit user-triggered refresh** path (a manual
"sync now" action), for cases where a user needs fresher data than the next scheduled
interval — this is additive to, not a replacement for, the 30-minute scheduled sync.

### OD-3A-07: Production Rollout Strategy

**Decision needed:** confirm the staged rollout (`meta-app-review.md` §7) as the plan, and set
the actual pilot-workspace criteria/timeline.

**Recommendation:** confirm the staged approach; specific timeline/pilot criteria deferred to
the Security/UAT/App Review readiness gate (`phase-3-implementation-sequence.md` §2, spanning
Phases 3–5), since App Review/Business Verification turnaround (both currently unverified —
`meta-app-review.md` §8 items 6–7) directly gate any concrete date.

**Security/Engineering/Operational impact:** covered by `meta-app-review.md` §7.
**Blocking phase:** the Security/UAT/App Review readiness gate.

**DECIDED (owner, 2026-09-10) — APPROVED: staged rollout**, with the following stages,
superseding `meta-app-review.md` §7's more general phrasing:
`internal/test → pilot → limited production → general availability`. **No concrete
production date may be set** until the App Review and Business Verification dependencies
(`meta-app-review.md` §§4–5, both still carrying unverified turnaround/timeline items per
§8) are confirmed — this restriction applies to every stage from "limited production"
onward, not only full general availability.

### OD-3A-08: Emergency Disconnect / Kill-Switch Mechanism

**Decision needed:** the exact operational mechanism for disabling Meta connectivity
workspace-by-workspace or globally without a code deploy.

**Recommendation:** no recommendation given — this is properly scoped alongside the broader
emergency-stop mechanism `SPEND_AND_FINANCIAL_CONTROLS.md` (SEC-010) already names for
financial/mutation controls generally (Phase 9 territory), not invented as a Meta-specific
one-off. The Security/UAT/App Review readiness gate should design this as an instance of
whatever general emergency-stop mechanism Phase 9 ultimately builds, or, if Meta connectivity
ships before Phase 9's mechanism exists, as a narrowly-scoped precursor the owner explicitly
approves as temporary.

**Security impact:** the absence of any kill-switch until Phase 9 is a real, accepted gap for
the interim — recorded explicitly rather than silently assumed away.
**Engineering/Operational impact:** deferred with the decision itself.
**Blocking phase:** the Security/UAT/App Review readiness gate, or earlier if the owner wants
an interim mechanism sooner — **superseded by the DECIDED block below, which requires it
sooner, in Phase 3.2.**

**DECIDED (owner, 2026-09-10) — APPROVED, reversing this document's original "no
recommendation" stance: a workspace-level Meta connection disable/kill switch is required
before production mutation capability is enabled, and must NOT wait for Phase 9's full
financial emergency-stop system.** This is scoped narrowly — a basic connection-level safety
control (disabling a connection must prevent any new Meta API operation from that connection,
read or write), not the broader financial/spend emergency-stop apparatus
`SPEND_AND_FINANCIAL_CONTROLS.md` (SEC-010) describes for Phase 9. Because Phase 3 itself has
no mutation capability (OD-3A-09), this basic kill switch does not block Phase 3's own
completion, but must be built as part of the Phase 3 connection lifecycle work (Phase 3.2 —
"Secure Token / Connection Lifecycle," per the renumbering below) so it already exists by the
time any future phase turns on mutation capability — it is not acceptable to defer building
it until that later phase. It is a distinct control from the ordinary user-initiated
disconnect flow (`meta-oauth.md` §6) — a kill switch must be immediate and does not need to
follow the full graceful-disconnect sequence to take effect.

### OD-3A-09: Autonomous Mutation Availability

**Decision needed:** confirm that no autonomous (non-human-initiated) Meta mutation exists or
is planned within Phase 3.

**Recommendation:** confirm — this is not actually an open question given the "Already
Decided" table above and the governing task's own explicit Hard Stop list ("DO NOT implement
Meta mutations"); recorded here as a formal restatement so the owner's approval of this
package includes an explicit, on-the-record confirmation rather than relying only on the task
brief's restriction being followed.

**Blocking phase:** N/A — this is a confirmation, not a phase-blocking decision.

**DECIDED (owner, 2026-09-10) — APPROVED: NONE in Phase 3.** All Phase 3 Meta operations are
human-initiated. No scheduler, AI, or system actor may autonomously mutate Meta state in
Phase 3 — this applies to every sub-phase (3.1–3.3 and, per the renumbering below, Phase 4's
sync/insights work and Phase 5's webhook/reconciliation work), not only OAuth/connection
establishment. Autonomous optimization remains explicitly a later phase's scope, unchanged
from the "Already Decided" table's existing `SystemActorContext` restatement above.

## Closure Summary (2026-09-10)

Phase 3A architecture is **APPROVED**. Every decision below is now settled except OD-3A-05,
which remains open by deliberate owner choice, not oversight.

| Decision                             | Final status                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| OD-3A-01 — V1 asset scope            | **ACCEPTED** — Businesses + Ad Accounts only                                                                                           |
| OD-3A-02 — Permission scope          | **ACCEPTED** — minimum verified set only, matrix re-verified at Phase 3.1                                                              |
| OD-3A-03 — Dev/prod app strategy     | **ACCEPTED** — separate apps, never shared credentials                                                                                 |
| OD-3A-04 — Account selection         | **ACCEPTED** — multiple ad accounts, single connection per workspace                                                                   |
| OD-3A-05 — Disconnect/data retention | **OWNER POLICY OPEN** — retention period not set; credential deletion + audit preservation are binding engineering rules regardless    |
| OD-3A-06 — Sync frequency            | **ENGINEERING DEFAULT** — 30 minutes, configurable, plus user-triggered refresh                                                        |
| OD-3A-07 — Production rollout        | **ACCEPTED** — staged: internal/test → pilot → limited production → GA; no dates until App Review/Business Verification confirmed      |
| OD-3A-08 — Emergency disconnect      | **ACCEPTED** — workspace-level kill switch required before production mutation capability, built in Phase 3.2, not deferred to Phase 9 |
| OD-3A-09 — Autonomous mutation       | **ACCEPTED** — none in Phase 3, human-initiated only                                                                                   |

Meta API version remains **DEFERRED** to Phase 3.1 re-verification (never permanently pinned
by this closure) — see `meta-app-review.md` §1 and the "Meta Version" section of
`phase-3a-gate-checklist.md`.
