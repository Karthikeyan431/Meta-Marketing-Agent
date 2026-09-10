# Phase 3 — Meta Integration Owner Decision Package

**Document ID:** META-119 | Version 1.0 | Status: Pending Owner Review | Phase: 3A (Architecture Finalization)

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

### OD-3A-06: Sync Frequency

**Decision needed:** how often incremental sync runs per connected account.

**Recommendation:** no recommendation given — this is a product/cost trade-off (more frequent
sync means fresher data and higher Meta API quota consumption per `meta-rate-limits.md`) best
set once real usage patterns and Meta's actual observed rate-limit headroom are known, closer
to Phase 3.4 implementation than at this architecture stage.

**Security impact:** none.
**Engineering impact:** none beyond what `meta-sync.md` §3 already specifies structurally
(cursor/checkpoint support, whatever the frequency).
**Operational/cost impact:** directly trades off against Meta API quota consumption
(`meta-rate-limits.md` §2).
**Blocking phase:** Phase 3.4.

### OD-3A-07: Production Rollout Strategy

**Decision needed:** confirm the staged rollout (`meta-app-review.md` §7) as the plan, and set
the actual pilot-workspace criteria/timeline.

**Recommendation:** confirm the staged approach; specific timeline/pilot criteria deferred to
Phase 3.7, since App Review/Business Verification turnaround (both currently unverified —
`meta-app-review.md` §8 items 6–7) directly gate any concrete date.

**Security/Engineering/Operational impact:** covered by `meta-app-review.md` §7.
**Blocking phase:** Phase 3.7.

### OD-3A-08: Emergency Disconnect / Kill-Switch Mechanism

**Decision needed:** the exact operational mechanism for disabling Meta connectivity
workspace-by-workspace or globally without a code deploy.

**Recommendation:** no recommendation given — this is properly scoped alongside the broader
emergency-stop mechanism `SPEND_AND_FINANCIAL_CONTROLS.md` (SEC-010) already names for
financial/mutation controls generally (Phase 9 territory), not invented as a Meta-specific
one-off. Phase 3.7 should design this as an instance of whatever general emergency-stop
mechanism Phase 9 ultimately builds, or, if Meta connectivity ships before Phase 9's mechanism
exists, as a narrowly-scoped precursor the owner explicitly approves as temporary.

**Security impact:** the absence of any kill-switch until Phase 9 is a real, accepted gap for
the interim — recorded explicitly rather than silently assumed away.
**Engineering/Operational impact:** deferred with the decision itself.
**Blocking phase:** Phase 3.7, or earlier if the owner wants an interim mechanism sooner.

### OD-3A-09: Autonomous Mutation Availability

**Decision needed:** confirm that no autonomous (non-human-initiated) Meta mutation exists or
is planned within Phase 3.

**Recommendation:** confirm — this is not actually an open question given the "Already
Decided" table above and the governing task's own explicit Hard Stop list ("DO NOT implement
Meta mutations"); recorded here as a formal restatement so the owner's approval of this
package includes an explicit, on-the-record confirmation rather than relying only on the task
brief's restriction being followed.

**Blocking phase:** N/A — this is a confirmation, not a phase-blocking decision.
