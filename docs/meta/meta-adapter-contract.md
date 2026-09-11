# Meta API Adapter Contract

**Document ID:** META-109 | Version 1.2 | Status: `listBusinesses`/`listAdAccounts` implemented (Phase 3.2); `listCampaigns`/`listAdSets`/`listAds` implemented 2026-09-11 (Phase 4.1); `getInsights`/mutation methods remain unimplemented | Phase: 3A (Architecture Finalization, closed); Phase 3.2/4.1 (discovery + read-only sync methods, complete)

Consolidates `ai-marketing-manager-gate-7-api-docs/docs/08-api/META_API_ADAPTER.md` (API-009)
and `ai-marketing-manager-gate-2-docs/docs/03-architecture/INTEGRATION_ARCHITECTURE.md`
(ARCH-007). **No method in this contract was implemented by Phase 3A** — this is the
interface Phase 3.1+ implements against.

## 0. Implementation Status (Phase 3.2, 2026-09-10)

`apps/api/src/plugins/meta-client.ts` implements `listBusinesses(params)`/`listAdAccounts
(params)` — a deliberate, documented extension of §1's originally-reconciled
`getBusiness(connectionRef, externalBusinessId)` (a single-object lookup by an already-known
ID). Discovery needs a LIST of businesses/accounts the token can access, which that
single-lookup shape cannot express; `listBusinesses`/`listAdAccounts` fill that gap. This is a
Phase 3.2 implementation decision, not an architecture gap — the non-negotiable boundary (§2),
pagination (§4, via Meta's `paging.next`, bounded to `MAX_DISCOVERY_PAGES = 20`), and
provider-response normalization (§2) are all upheld exactly as specified. `getBusiness` (a
single-ID lookup) and `getAdAccount` remain unimplemented.

## 0.1 Implementation Status (Phase 4.1, 2026-09-11)

`packages/domain/src/meta/client.ts` (moved here from `apps/api/src/plugins/meta-client.ts` in
this phase — `workers/sync`'s real job processor is the first caller that isn't an API route,
so the adapter had to move somewhere both `apps/api` and every worker can import; see the
file's own doc comment) additionally implements `listCampaigns(connectionRef,
externalAdAccountId)`, `listAdSets(connectionRef, externalCampaignId)`, `listAds(connectionRef,
externalAdSetId)` — matching §1's already-reconciled interface shape exactly (no single-ID
`getCampaign`/`getAdSet`/`getAd` implemented; sync only ever needs the list form). `getInsights`
and every mutation method (`createCampaign`, `updateCampaign`, `updateAdSet`, `updateAd`,
`verifyOperation`) remain unimplemented (Phase 4.2+/OD-3A-09 scope).

## 1. Interface (reconciled — API-009's list vs. the governing task's list)

API-009 (already-existing Gate 7 doc) names: `getAdAccounts, getCampaign, listCampaigns,
getInsights, createCampaign, updateCampaign, updateAdSet, updateAd, verifyOperation`. The
governing task's own illustrative list additionally names `getBusiness, listAdSets, listAds`.
Reconciled, single authoritative interface for Phase 3.1:

```
MetaClient
 ├── getBusiness(connectionRef, externalBusinessId)
 ├── listAdAccounts(connectionRef)
 ├── getAdAccount(connectionRef, externalAdAccountId)
 ├── listCampaigns(connectionRef, externalAdAccountId, cursor?)
 ├── getCampaign(connectionRef, externalCampaignId)
 ├── listAdSets(connectionRef, externalCampaignId, cursor?)
 ├── listAds(connectionRef, externalAdSetId, cursor?)
 ├── getInsights(connectionRef, scope, dateRange, breakdowns?, cursor?)
 ├── createCampaign(connectionRef, externalAdAccountId, payload)      — not implemented until Phase 4.1+, and even then gated by policy/approval (meta-api-contracts.md)
 ├── updateCampaign(connectionRef, externalCampaignId, payload)
 ├── updateAdSet(connectionRef, externalAdSetId, payload)
 ├── updateAd(connectionRef, externalAdId, payload)
 └── verifyOperation(connectionRef, operationRef)                     — read-after-write check, meta-error-model.md §4
```

`connectionRef` is always a credential **reference** (`meta-token-security.md` §2), never a
raw token — the adapter is the only component that ever resolves a reference to actual
credential material.

## 2. Non-Negotiable Boundary (from API-009, unchanged)

The domain layer must not: construct raw Meta URLs, manage Meta access tokens directly, depend
on provider-specific response/error structures, or issue arbitrary provider operations outside
this named interface. Provider-specific response formats must not leak into domain logic —
every adapter method returns application-normalized shapes (`meta-resource-model.md`), never a
passthrough of Meta's own JSON.

## 3. Timeout / Retry Behavior

Bounded timeout per call (exact value a Phase 3.1 implementation detail, not fixed by this
architecture document). Retry only transient/network-shaped failures and appropriate
rate-limit responses (`meta-rate-limits.md`) — never blindly retry an authentication failure,
a permission denial, or a validation error (`meta-error-model.md`, from
`META_RETRY_AND_FAILURE.md`, unchanged). Exponential backoff with jitter, bounded attempt
count.

## 4. Pagination

Every list-shaped method (`listAdAccounts`, `listCampaigns`, `listAdSets`, `listAds`,
`getInsights`) handles Meta's cursor-based pagination (`meta-insights.md` §1) internally or
exposes a cursor the caller passes back explicitly — never silently truncates a result set at
the first page.

## 5. Rate-Limit Handling & Version Handling

See `meta-rate-limits.md` for the full model; the adapter is the single place that reads
Meta's rate-limit response headers and decides backoff. API version is read from configuration
(`meta-app-review.md` §1), never hardcoded per-call — a version bump is a config change, not a
code change across every call site.

## 6. Telemetry / Request Correlation / Idempotency

Every adapter call carries this project's existing `correlationId` convention (already used
throughout `apps/api`/`workers/*` — `request.requestId`, propagated into
`AuditEvent.correlationId`) so a Meta-side operation can be traced back to the application
request or job that triggered it, without needing to log or correlate via anything
Meta-specific. Mutating calls (`createCampaign`, `updateCampaign`, `updateAdSet`, `updateAd`)
carry an idempotency key, reusing the same `idempotencyKey` field already defined in
`docs/identity/worker-authorization-contract.md`'s canonical job context — not a new
idempotency mechanism.

## 7. Error Normalization

See `meta-error-model.md` — the adapter is solely responsible for translating a raw Meta error
into one of the application's normalized error categories before it ever reaches a route
handler, worker, or AI tool.
