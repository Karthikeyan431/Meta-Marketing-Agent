# Phase 3 — Meta Integration Implementation Sequence

**Document ID:** META-120 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

## 1. Reconciliation Note (structural finding from this phase's research)

`workers/README.md` (already shipped, Phase 1) labels the `sync`/`webhook`/`insights` worker
packages as belonging to **"Phase 4 — Core Meta Data"**, not Phase 3, mirroring
`IMPLEMENTATION_PHASES.md`'s own split: Phase 3 = "Meta Connection" (OAuth, credential
protection, account discovery, connection health, adapter/sync **foundation**), Phase 4 =
"Core Meta Data" (ad accounts, campaigns, ad sets, ads, normalized data model, pagination and
**synchronization**). The governing task's own suggested Phase 3.4 ("Core advertising resource
synchronization") and Phase 3.5 ("Insights") sit closer to what this codebase's own docs
already call Phase 4 than Phase 3. This is not a blocking contradiction — the governing task
explicitly says "Adjust the sequence if the architecture requires it" — but it is a real,
citable structural point: **recommend renumbering Phase 3.4/3.5 as the start of Phase 4** once
implementation actually begins, keeping Phase 3 (3.1–3.3, 3.7) scoped strictly to connection
establishment/health/security readiness, with 3.4/3.5's _sync/insights architecture content_
(this phase's `meta-sync.md`/`meta-insights.md`) unchanged either way — only the phase number
changes, not the design. Recorded here rather than silently renumbering unilaterally, since
renumbering an already-established phase boundary is itself a decision worth the owner seeing
explicitly.

## 2. Sequence (as given by the governing task, with the note above applied where relevant)

| Sequence                                                                                                                          | Scope                                                                                                                                                                                                                            | Depends on                            | Security gates that must not be skipped                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 3.1** — Meta app + OAuth                                                                                                  | Development/production Meta app setup (`meta-app-review.md` §2); OAuth flow implementation (`meta-oauth.md`); final API version pin, re-verified at start (`meta-app-review.md` §1/§8); permission scope finalized (OD-3A-01/02) | Phase 3A (this document set) approved | State CSRF/replay protection (`meta-threat-model.md` #1–#3) must be implemented and tested before any real OAuth flow runs, even in development        |
| **Phase 3.2** — Secure connection/token lifecycle                                                                                 | `MetaConnection` migration (`meta-connection-model.md`); encrypted credential storage (`meta-token-security.md`); 5-state health model (`meta-connection-health.md`)                                                             | 3.1                                   | Credential storage/access rules (`meta-token-security.md` §2) verified before any real token is ever persisted                                         |
| **Phase 3.3** — Business/ad-account discovery                                                                                     | Discovery flow (`meta-account-discovery.md`); OD-3A-04 (single/multi account) implemented                                                                                                                                        | 3.2                                   | Tenant-isolation rules (`meta-resource-model.md` §6, `meta-threat-model.md` #6–#8) tested against real cross-workspace attempts before discovery ships |
| **Phase 3.4** — Core advertising resource sync _(recommend renumbering to Phase 4.1 per §1 above — content unchanged either way)_ | Campaign/ad-set/ad/creative normalization (`meta-resource-model.md`); sync worker (`meta-sync.md`)                                                                                                                               | 3.3                                   | Worker authorization contract reuse verified (`docs/identity/worker-authorization-contract.md`), no new contract invented                              |
| **Phase 3.5** — Insights _(recommend renumbering to Phase 4.2 per §1 above)_                                                      | Insights sync (`meta-insights.md`); raw/calculated/AI-interpretation boundary enforced structurally, even with no AI consumer yet                                                                                                | 3.4                                   | Money-handling rule (integer/decimal, never float) verified before any spend-shaped metric is stored                                                   |
| **Phase 3.6** — Webhooks + reconciliation                                                                                         | Webhook endpoint (`meta-webhooks.md`); reconciliation pass                                                                                                                                                                       | 3.4/3.5                               | Signature verification (`meta-threat-model.md` #13) tested before the endpoint is registered with Meta                                                 |
| **Phase 3.7** — Security/UAT/App Review readiness                                                                                 | App Review submission (`meta-app-review.md` §4); Business Verification (§5); production rollout (OD-3A-07); emergency disconnect mechanism (OD-3A-08); full `meta-test-matrix.md` executed                                       | 3.1–3.6                               | Full threat-model test coverage (`meta-threat-model.md`, all 20 rows) confirmed green before production Meta app is submitted for review               |

## 3. Explicit Non-Skip Rule

Per the governing task's own instruction ("Create an implementation sequence that does NOT
skip security gates"): no sub-phase above may begin implementation before the sub-phase(s) it
depends on have their own security gate satisfied, not merely "code written." This mirrors the
discipline already established across Phase 2.3–2.6, where every implementation phase's Stop
Condition required a green CI run with real security/integration tests before the next phase
began.
