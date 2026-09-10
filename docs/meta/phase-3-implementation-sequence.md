# Meta Integration Implementation Sequence

**Document ID:** META-120 | Version 1.4 | Status: Owner-Approved 2026-09-10; Phase 3.1 and Phase 3.2 (Discovery) implemented and real-UAT-verified 2026-09-10 | Phase: 3A (Architecture Finalization, closed); Phase 3.1/3.2 (Implementation, complete)

## 1. Phase Numbering (owner-decided 2026-09-10, binding — supersedes this document's prior

Phase 3.1–3.7 draft)

This phase's original research (`phase-3a-gate-checklist.md`'s verification history) found
that `workers/README.md` (already shipped, Phase 1) and `IMPLEMENTATION_PHASES.md` already
split Meta work across Phase 3 ("Meta Connection") and Phase 4 ("Core Meta Data") at the
master-SDLC level. The owner has now resolved the resulting numbering question directly,
aligning this project's Meta sub-phases with the master SDLC rather than the flatter Phase
3.1–3.7 draft this document originally proposed:

```
PHASE 3 — META CONNECTION
  3.1  OAuth
  3.2  Secure Token / Connection Lifecycle
  3.3  Business + Ad Account Discovery

PHASE 4 — CORE META DATA
  4.1  Campaign / Ad Set / Ad Synchronization
  4.2  Insights

PHASE 5 — META EVENTS / RELIABILITY
  5.1  Webhooks
  5.2  Reconciliation / Recovery
```

No conflicting numbering scheme may be introduced by any future phase. The architecture
content this phase produced (`meta-oauth.md`, `meta-token-security.md`,
`meta-account-discovery.md`, `meta-resource-model.md`, `meta-sync.md`, `meta-insights.md`,
`meta-webhooks.md`) is unchanged by this renumbering — only the phase labels below change,
not the design.

## 2. Sequence

| Sequence                                               | Scope                                                                                                                                                                                                                                                                                                                                      | Depends on                            | Security gates that must not be skipped                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 3.1** — OAuth                                  | Development/production Meta app setup (`meta-app-review.md` §2, OD-3A-03); OAuth flow implementation (`meta-oauth.md`); final API version pin, re-verified at start, never assumed from Phase 3A (`meta-app-review.md` §1/§8); permission scope finalized to the minimum set (OD-3A-01/02)                                                 | Phase 3A (this document set) approved | State CSRF/replay protection (`meta-threat-model.md` #1–#3) must be implemented and tested before any real OAuth flow runs, even in development                                                                        |
| **Phase 3.2** — Secure Token / Connection Lifecycle    | `MetaConnection` migration (`meta-connection-model.md`); encrypted credential storage (`meta-token-security.md`); 5-state health model (`meta-connection-health.md`); **workspace-level connection disable/kill switch (OD-3A-08) — built here, not deferred to a later phase**; credential deletion + audit-preservation rules (OD-3A-05) | 3.1                                   | Credential storage/access rules (`meta-token-security.md` §2) verified before any real token is ever persisted; kill switch verified to block all new Meta API operations before this sub-phase is considered complete |
| **Phase 3.3** — Business + Ad Account Discovery        | Discovery flow (`meta-account-discovery.md`); multiple ad accounts under one connection (OD-3A-04)                                                                                                                                                                                                                                         | 3.2                                   | Tenant-isolation rules (`meta-resource-model.md` §6, `meta-threat-model.md` #6–#8) tested against real cross-workspace attempts before discovery ships                                                                 |
| **Phase 4.1** — Campaign / Ad Set / Ad Synchronization | Campaign/ad-set/ad/creative normalization (`meta-resource-model.md`); sync worker (`meta-sync.md`); scheduled sync at the 30-minute engineering default plus user-triggered refresh (OD-3A-06)                                                                                                                                             | 3.3                                   | Worker authorization contract reuse verified (`docs/identity/worker-authorization-contract.md`), no new contract invented                                                                                              |
| **Phase 4.2** — Insights                               | Insights sync (`meta-insights.md`); raw/calculated/AI-interpretation boundary enforced structurally, even with no AI consumer yet                                                                                                                                                                                                          | 4.1                                   | Money-handling rule (integer/decimal, never float) verified before any spend-shaped metric is stored                                                                                                                   |
| **Phase 5.1** — Webhooks                               | Webhook endpoint (`meta-webhooks.md`)                                                                                                                                                                                                                                                                                                      | 4.1/4.2                               | Signature verification (`meta-threat-model.md` #13) tested before the endpoint is registered with Meta                                                                                                                 |
| **Phase 5.2** — Reconciliation / Recovery              | Periodic reconciliation pass (`meta-sync.md` §1); recovery after connection/provider outages (`meta-connection-health.md` §7)                                                                                                                                                                                                              | 5.1                                   | Reconciliation must converge to true current state regardless of webhook event ordering (`meta-threat-model.md` #15) before this sub-phase is considered complete                                                      |

Security/UAT/App Review readiness (App Review submission, Business Verification, staged
production rollout per OD-3A-07, full `meta-test-matrix.md` execution) is not a numbered
sub-phase of its own — it is a cross-cutting completion gate that spans Phases 3–5, verified
continuously as each sub-phase ships (`meta-app-review.md`, `meta-test-matrix.md`), with a
final full-matrix pass required before any production Meta app submission, consistent with
§3's non-skip rule.

## 3. Explicit Non-Skip Rule

Per the governing task's own instruction ("Create an implementation sequence that does NOT
skip security gates"): no sub-phase above may begin implementation before the sub-phase(s) it
depends on have their own security gate satisfied, not merely "code written." This mirrors the
discipline already established across Phase 2.3–2.6, where every implementation phase's Stop
Condition required a green CI run with real security/integration tests before the next phase
began.

## 4. Phase 3.1 Status (2026-09-10)

**Complete.** OAuth flow, Redis-backed state/CSRF protection, the `MetaConnection` model
(credential material AES-256-GCM encrypted at the application layer), and the full connection
lifecycle (connect/list/reconnect/disconnect) are implemented and tested — 35 new integration
tests, 7 new unit tests, zero regressions. Meta's current documentation was re-verified fresh
immediately before implementation (superseding Phase 3A's same-day pass for the OAuth-specific
items). See `phase-3-1-implementation-report.md` for full detail, including §14's security-test
coverage of all 20 threat-model rows relevant to this phase's scope.

**Real Meta UAT is complete (2026-09-10).** The owner created a Meta Developer App and
provided Development-mode credentials; a real OAuth round-trip (connect, reconnect, disconnect,
a genuine Meta-rejected failure case) was performed and verified end-to-end against the real
Meta API — see `phase-3-1-implementation-report.md` §15–17. Real UAT surfaced one genuine
implementation defect (the callback incorrectly required a request-time auth header that no
real browser redirect can ever carry, contradicting the already-approved `meta-oauth.md` §2
design) — fixed as the minimum necessary correction, re-verified by the full test/build/lint/
security-scan suite plus a fresh real OAuth round-trip, and documented in the same report's
§16. Phase 3.2 may now begin.

## 5. Phase 3.2 Status (2026-09-10) — naming note, then implementation status

**Naming reconciliation (owner-confirmed 2026-09-10):** the governing task labeled this work
"Phase 3.2 — Meta Business & Ad Account Discovery." Per §1's table above, that is this
document's **Phase 3.3** — this document's own "Phase 3.2" is "Secure Token / Connection
Lifecycle," whose one still-outstanding item is **OD-3A-08's workspace-level Meta connection
kill switch**, not yet built. The owner reviewed this discrepancy and explicitly chose to
proceed with Business/Ad Account discovery under the task's own "Phase 3.2" label (matching
`phase-3-2-implementation-report.md`'s filename), rather than block on the numbering. This is
recorded here, not silently reconciled: **the OD-3A-08 kill switch remains outstanding** and
must land before any future phase enables production Meta mutation capability (OD-3A-08's own
binding text — "must NOT wait," "not acceptable to defer"). It is not a blocker for the
discovery work below, since Phase 3 still has zero mutation capability (OD-3A-09) either way.

**Implementation: complete.** Business/Ad Account discovery, normalization, multi-account
selection, deselection, and workspace-scoped persistence are implemented and tested — 39 new
integration tests (discovery, selection, deselection, tenant isolation, concurrency, security),
zero regressions across the full existing suite (191 integration + 69 unit + 6 E2E). Meta's
current documentation was re-verified fresh for the discovery-specific endpoints/fields/
pagination immediately before implementation. **Real Meta UAT is complete (2026-09-10)** —
business discovery, ad-account discovery, selection, deselection, reselection-after-
deselection, and tenant isolation were all verified against the real, currently-authorized
Meta Development-mode connection and its one real ad account. See
`phase-3-2-implementation-report.md` for full detail.
