# Meta Rate-Limit & Abuse-Protection Model

**Document ID:** META-111 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-7-api-docs/docs/08-api/API_RATE_LIMITS.md` (API-012),
`ai-marketing-manager-gate-6-security-docs/docs/07-security/RATE_LIMITING_ABUSE.md` (SEC-013),
and a live-verified check of Meta's current Marketing API rate-limit model.

## 1. Two Independent Levels (from API-012, unchanged)

**Application rate limits** (this application's own throttling, independent of Meta) and
**Meta provider rate limits** (imposed by Meta, outside this application's control) are
separate concerns — the adapter must protect against both, not conflate them.

## 2. Live-Verified Meta Rate-Limit Model (2026-09-10)

**Source:** `developers.facebook.com/docs/marketing-api/overview/rate-limiting/` (directly
fetched).

Meta's current Marketing API uses **Business Use Case (BUC)** rate limiting, scoped per ad
account per business-use-case category (e.g. every "Ads Management" BUC endpoint call against
one ad account shares a single quota pool). Response headers:

- `X-Business-Use-Case-Usage` — JSON payload with `call_count`, `total_cputime`, `total_time`,
  `estimated_time_to_regain_access`.
- `X-Ad-Account-Usage` — `acc_id_util_pct`, `reset_time_duration`, `ads_api_access_tier`.

Official guidance: use exponential backoff and read the reset-time estimation from these
headers rather than a fixed delay. **The exact error code returned at 100% usage is
unconfirmed — see `meta-error-model.md` §2 — detection should key primarily off these headers,
not a single assumed error code.**

## 3. Backoff Strategy

Exponential backoff with jitter, bounded attempts (`meta-adapter-contract.md` §3), informed by
`estimated_time_to_regain_access`/`reset_time_duration` when present in the response rather
than a naive fixed schedule.

## 4. Application-Side Controls (from SEC-013, unchanged, restated for Meta)

- **Per-workspace fairness** — one workspace's heavy sync/insights activity must not starve
  another workspace's requests against the shared worker pool.
- **Worker concurrency limits** — bounded concurrent Meta API calls per worker instance and
  per ad account, reusing this project's existing worker-concurrency patterns
  (`ai-marketing-manager-gate-2-docs/docs/03-architecture/WORKER_ARCHITECTURE.md`'s
  workspace/ad-account-scoped locking for conflicting simultaneous mutations).
- **Burst protection** — request throttling at the adapter layer independent of whether Meta
  has yet signaled a limit, so a bug or runaway loop in application code cannot itself become
  the trigger for Meta-side rate limiting or account flagging.
- **"Meta account" as its own rate-limit scope dimension** (SEC-013, already named) — alongside
  whatever other dimensions (per-user, per-workspace) the application's general rate-limiting
  already applies.

## 5. AI Loop Protection (governing task's explicit requirement)

**AI must never be able to create an uncontrolled Meta API request loop.** This is layered on
top of the already-shipped AI authorization boundary (`docs/identity/ai-authorization-contract.md`)
and Gate 6's existing guidance ("Apply both request and tool-call budgets to prevent expensive
loops," `API_RATE_LIMITS.md`): any future AI tool that triggers a Meta read/sync/mutation must
be subject to a bounded per-conversation or per-request tool-call budget, independent of and in
addition to the application- and provider-level limits above. This phase implements no AI tool
— recorded here as a binding constraint on whichever future phase does.
