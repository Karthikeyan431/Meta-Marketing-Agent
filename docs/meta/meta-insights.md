# Meta Insights Architecture

**Document ID:** META-108 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_INSIGHTS_ARCHITECTURE.md`
(META-005), `ai-marketing-manager-gate-3-docs/docs/04-data/SCHEMA_DESIGN.md`'s `insights`
fact-table design, and a live-verified check of Meta's current Insights API
(`developers.facebook.com/docs/marketing-api/insights`, fetched 2026-09-10).

## 1. Live-Verified Findings (2026-09-10)

Both synchronous and asynchronous Insights requests exist on the current API. Pagination is
cursor-based (`paging.cursors.before/after`). Parameters split into time/attribution
parameters, `fields` (metrics), and `breakdowns`; an unparameterized `GET` defaults to
approximately the last 30 days.

**REQUIRES RE-VERIFICATION BEFORE PHASE 3.1 (not confirmed this pass):** the exact threshold
at which Meta requires or strongly recommends the asynchronous report flow over synchronous
(the official page deferred to a separate "Asynchronous Requests best practices" sub-page this
research pass did not reach), and the exact current date-range/result-size limits for
synchronous requests. The 2026-09-04 `TECH_STACK.md` finding ("asynchronous report jobs are
recommended for larger pulls, and as of v25.0 async report jobs return richer default error
fields: `error_code`, `error_message`, `error_subcode`, `error_user_title`, `error_user_msg`")
is retained as a working assumption but is explicitly unconfirmed by this pass's direct fetch —
Phase 3.1 must re-verify the exact threshold before implementing the sync-vs-async decision
logic in the adapter.

## 2. Boundary: Raw Metrics / Calculated Metrics / AI Interpretation

Three distinct layers, never blurred (from META-005, restated with the added AI layer per this
phase's governing task):

1. **Raw Meta metrics** — exactly what the Insights API returned for a given dimension/date/
   breakdown combination, stored with its source context intact (see §3).
2. **Calculated metrics** — derived application-side from raw metrics using a single,
   consistently-applied formula (e.g. CTR, CPC, CPM, CPL) — never recomputed differently in
   two different places, and never treated as more authoritative than the raw inputs they came
   from (`SCHEMA_DESIGN.md`: "Do not treat derived metrics as source-of-truth when they can be
   recalculated").
3. **AI interpretation** — a narrative or recommendation an AI feature (future phase) produces
   from layers 1–2. **AI must never invent a metric value.** Any number an AI surfaces to a
   user must trace back to a stored raw or calculated metric, never a value the model generated
   from its own estimation — directly required by BR-013 ("must not fabricate Meta entities,
   metrics, execution results, or capabilities") and META-005's own rule: "Reports must be
   generated from canonical/validated analytics data, not from unverified model-generated
   numbers." This phase implements none of the AI layer — recorded here only as a boundary the
   eventual AI phase (Phase 8) must respect, consistent with the already-shipped
   `ai-authorization-contract.md`'s "AI is never the security/data-truth boundary" principle.

## 3. Source Context Preservation (from META-005, unchanged)

Every stored insight fact preserves: source metric meaning (never silently remapped to a
differently-defined metric with the same display name), source date/granularity, attribution
window and breakdown context. Comparing two insight rows with incompatible attribution windows
or breakdowns without explicit handling is not permitted — a naive sum/average across
incompatible rows would produce a number that looks precise but is not meaningful.

## 4. Retrieval Model

- **Synchronous** requests for small, well-understood pulls (a single campaign, a short date
  range) — pending Phase 3.1's re-verified threshold, §1.
- **Asynchronous** report jobs for larger pulls — reuses this project's existing worker/queue
  infrastructure (BullMQ, `packages/queue`), following the same job-authorization-context
  pattern as every other worker job (`docs/identity/worker-authorization-contract.md`).
- **Pagination**: cursor-based, per §1 — the adapter must page through a complete result set
  before considering a sync pass complete, not silently truncate at the first page.
- **Rate limits / retries**: see `meta-rate-limits.md`.
- **Partial failure**: if a multi-page or multi-campaign Insights pull partially succeeds, the
  application must record exactly which portions succeeded/failed, never collapse a partial
  result into an unqualified "success" — same rule as `meta-sync.md` §4's bulk-operation
  outcome requirement (from `META_RETRY_AND_FAILURE.md`).

## 5. Freshness

Every analytics response surfaces: last-sync time, the requested range, source coverage
(which portion of the requested range actually has synced data), and a stale/unavailable flag
when applicable — from META-005, unchanged. This directly supports BR-012 ("stale data must be
identified when freshness affects a decision").

## 6. Storage (conceptual, from `SCHEMA_DESIGN.md`, not a migration)

Fact-oriented schema. Dimensions: workspace, ad account, campaign, ad set, ad, date,
breakdowns. Metrics: spend, impressions, reach, clicks, conversions, leads, revenue/value, plus
the derived CTR/CPC/CPM/CPL set from §2. Money-shaped metrics (spend, revenue/value) follow
this project's existing money-handling rule (`API_CONTRACTS.md`/API-003, already governing
every other monetary value in this codebase): never floating point, integer minor units or
exact decimal + currency.
