# Final Technology Baseline

## Application
TypeScript, Next.js/React, Node.js API, pnpm workspaces.

## Data
PostgreSQL + Prisma.

## Async
Redis + BullMQ.

## Testing
Vitest + Playwright.

## Infrastructure
Docker + Terraform + AWS target.

## Delivery
GitHub + GitHub Actions.

## AI
Provider abstraction; OpenAI initial implementation target.

## External Integration
Dedicated Meta adapter; provider version pinned only after current capability verification.

### Meta Graph / Marketing API — Live Verification (2026-09-04)

Verified against current official Meta for Developers documentation (not guessed). Evidence and sources below; this satisfies ADR-005 step 1–6 for Phase 1A but does **not** pin a version in configuration — no application configuration exists yet (Phase 1A does not scaffold).

**Current versions** (source: [Graph API Versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)):

| Version | Release date | Expires | Notes |
|---|---|---|---|
| v26.0 | 2026-07-29 | TBD | Latest. ~5 weeks old as of verification date — third-party tooling/SDK support may still be catching up. |
| v25.0 | 2026-02-18 | 2028-07-29 | Current examples in Meta's own live Insights/Marketing API documentation still reference this version. Longer proven runway. |

**Recommendation for Phase 3 (Meta Connection) to formally decide:** target **v25.0** as the initial pinned version — it is the version Meta's own current docs use in examples, has a long support window, and avoids being an early adopter of a version released only weeks ago. Re-verify immediately before pinning, since this can shift quickly.

**Capability verification:**
- **Campaign/ad set/ad management (CRUD):** confirmed — Marketing API supports programmatic creation, update, pause, and deletion of campaigns, ad sets, and ads. Ad creatives are immutable once created (a new creative must be created to change one) — source: [Marketing API overview](https://developers.facebook.com/docs/marketing-api/overview).
- **Insights/reporting:** confirmed — the Ads Insights API exposes effectively any metric available in Ads Manager, at ad-account/campaign/ad-set/ad level, with breakdowns; asynchronous report jobs are recommended for larger pulls, and as of v25.0 async report jobs return richer default error fields (`error_code`, `error_message`, `error_subcode`, `error_user_title`, `error_user_msg`) — directly useful for the adapter's error-classification requirement (Gate 5 META-001). Source: [Ads Insights API](https://developers.facebook.com/docs/marketing-api/insights).
- **OAuth scopes / permissions:** confirmed three relevant permissions, each gated by Meta App Review with specific screencast/use-case justification requirements — source: [Permissions reference](https://developers.facebook.com/docs/permissions/reference).
  - `ads_management` — read + manage (create/update/pause/delete) ad accounts the app has been granted access to.
  - `ads_read` — read-only access to the Ads Insights API (and server-side event sending); narrower than `ads_management`.
  - `business_management` — read/write access to Business Manager assets, needed for ad-account claiming/discovery.
- **Known breaking change (v25.0):** creation, duplication, and updates to Advantage+ shopping/app campaigns are no longer allowed as of v25.0 — existing such campaigns require Meta's migration path. Relevant if any MVP mutation flow could touch Advantage+ campaign types.
- **Known upcoming deprecation (v26.0):** a number of Page/Post/Video/Stories impression metrics are deprecated — low relevance to this platform (paid ad campaign metrics, not organic Page/Post insights), but worth a note for the Insights adapter's metric allowlist.
- Source: [v25.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version25.0/).

**Still open (per ADR-005, correctly deferred to Phase 3):** exact OAuth scope list per MVP mutation set, Meta App Review submission content, and the final pinned version at the moment implementation actually starts (must be re-verified then, not assumed from this date).
