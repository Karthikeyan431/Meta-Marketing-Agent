# Meta Integration Architecture

**Document ID:** META-101 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates and operationalizes `ai-marketing-manager-gate-5-docs/docs/06-meta/META_INTEGRATION_ARCHITECTURE.md`
(META-001, Draft for Approval — never formally accepted) and
`ai-marketing-manager-gate-2-docs/docs/03-architecture/INTEGRATION_ARCHITECTURE.md` (ARCH-007)
against the actual, currently-shipped codebase (Phase 0–2.6) and a fresh live verification of
Meta's current developer documentation (2026-09-10 — see `meta-app-review.md` §1 and each
document's own verification note). No code, schema, or dependency was changed to produce this
document — this phase is architecture only.

## 1. Design Principles (restated from META-001, unchanged)

1. Meta is an external system of record — this application never becomes the source of truth
   for advertising data; it mirrors and normalizes it.
2. Internal application IDs are always distinct from Meta's external IDs (`meta-resource-model.md`
   §2) — a Meta ID is never, by itself, an authorization key.
3. Every Meta API call goes through exactly one adapter (`meta-adapter-contract.md`) — no
   route, worker, or AI tool constructs a raw Meta HTTP request itself.
4. Meta credentials never reach the browser, an AI prompt, a log line, or an audit-event body
   (`meta-token-security.md`).
5. Every mutation against a Meta resource passes application authorization and policy before
   the adapter is ever called (`meta-api-contracts.md`, `meta-threat-model.md`).
6. External state is verified after a mutation, not assumed from the request having been
   accepted (`meta-error-model.md` §4, `meta-sync.md` §5).
7. Meta API versions and permission scopes are configuration, never hardcoded in application
   logic (`meta-permissions.md`, `meta-app-review.md`).

## 2. Target Boundary (from the governing task, confirmed unchanged by this phase's research)

```
Clerk User
  ↓
Application User                    (packages/domain/src/identity/users.ts — shipped, Phase 2.3)
  ↓
Workspace                           (packages/domain/src/identity/workspaces.ts — shipped, Phase 2.3)
  ↓
Application Permission              (rbac-catalog.ts — meta_connection.*/campaign.* already seeded, Phase 2.4A/2.4)
  ↓
Meta Connection                     (conceptual only — meta-connection-model.md, NOT implemented)
  ↓
Authorized Meta Business / Ad Account   (conceptual only — meta-account-discovery.md, NOT implemented)
  ↓
Meta Adapter                        (conceptual only — meta-adapter-contract.md, NOT implemented)
  ↓
Meta Graph / Marketing API          (external, live-verified v26.0/v25.0 — meta-app-review.md)
  ↓
Normalized Application Model        (conceptual only — meta-resource-model.md, NOT implemented)
  ↓
Sync / Insights / Mutations         (conceptual only — meta-sync.md, meta-insights.md, NOT implemented)
  ↓
Verification                        (conceptual only — meta-error-model.md §4, NOT implemented)
  ↓
Audit                               (reuses the shipped AuditEvent schema — meta-architecture.md §4, NOT wired)
```

Everything above the "Meta Connection" line is **already implemented, tested, and CI-verified**
(Phases 2.3–2.6). Everything from "Meta Connection" down is **architecture only as of this
phase** — no migration, no route, no adapter code, no credentials exist yet anywhere in this
repository (confirmed by direct inspection: `packages/domain/prisma/schema.prisma`'s own
top-of-file comment explicitly defers `meta_connections, ad_accounts, campaigns, ad_sets, ads,
creatives, insights` to their owning phases; `.env.example` has zero Meta variables with an
explicit "out of scope until Phase 3" comment; `workers/sync`, `workers/insights`,
`workers/optimization` are generic placeholder bootstraps with no Meta-specific code).

## 3. Integration Boundary (from META-001, unchanged)

```
Browser
  ↓ (never a privileged Meta API client — apps/web/src/lib/api-client.ts already asserts this
      in a code comment: "NEVER calls Meta's API directly from the browser — all Meta access
      goes through the [backend]")
Application API (apps/api)
  ↓
Meta Integration Service
  ├── OAuth / connection management        (meta-oauth.md)
  ├── Token lifecycle                      (meta-token-security.md)
  ├── Capability discovery                 (meta-account-discovery.md §3)
  ├── Request builder                      (meta-adapter-contract.md)
  ├── Response normalization               (meta-resource-model.md)
  ├── Error classifier                     (meta-error-model.md)
  ├── Rate-limit handling                  (meta-rate-limits.md)
  └── API-version isolation                (meta-app-review.md §1, meta-adapter-contract.md §5)
  ↓
Meta Graph / Marketing API
```

## 4. Capability Model (from META-001, unchanged; reconciled against the shipped permission catalog)

Rather than assuming every connected ad account supports every operation, the application
stores discovered **capabilities** per connection/account (`READ_AD_ACCOUNT`, `READ_CAMPAIGN`,
`READ_INSIGHTS`, `CREATE_CAMPAIGN`, `UPDATE_BUDGET`, `UPDATE_STATUS`, `CREATE_AD_SET`,
`CREATE_AD`, `MANAGE_CREATIVE`, `RECEIVE_AD_ACCOUNT_WEBHOOKS`), verified live against Meta's
current permission/App-Review state rather than hardcoded — see `meta-permissions.md`. This is
independent of, and layered underneath, the application's own RBAC permission check
(`meta_connection.*`/`campaign.*` in `rbac-catalog.ts`) — a user can hold `campaign.update`
and still be blocked if the connected ad account itself lacks `UPDATE_STATUS` capability
(e.g. a Meta-side restriction, disabled account, or missing App Review approval).

## 5. Audit Reuse (confirmed, no new audit system)

Gate 6's `SEC-012` (`AUDIT_LOGGING.md`) requires capturing "Meta connection changes," "Meta
mutations," "verification outcomes," and "emergency-stop changes" with metadata identical in
shape to the already-implemented `AuditEvent` Prisma model (`packages/domain/prisma/schema.prisma`)
— `workspaceId`, `actorType`, `actorId`, `eventType`, `resourceType`, `resourceId`, `action`,
`outcome`, `correlationId`, `metadata`. Meta integration reuses this schema unchanged via new
`eventType`/`resourceType` string values (e.g. `meta_connection.connected`,
`meta_connection.disconnected`, `campaign.mutation_requested`) — no new audit table or system
is proposed. See `meta-threat-model.md` §"Audit" and `docs/identity/audit-logging.md`-equivalent
(`packages/domain/src/identity/audit.ts`'s `recordAuditEvent()`).

## 6. Worker Architecture Reuse (confirmed, no new worker contract)

`ai-marketing-manager-gate-2-docs/docs/03-architecture/WORKER_ARCHITECTURE.md` (ARCH-005) names
Sync, Insights, and Webhook workers as Meta-specific consumers; `docs/identity/
worker-authorization-contract.md` (already shipped, Phase 2.4A/2.4) defines the canonical job
authorization context (`workspaceId`, `initiatingActor`/`SystemActorContext`, `resourceScope`,
`actionScope`, `correlationId`, `jobId`, `idempotencyKey`, `retryMetadata`) that every worker in
this codebase must use — Meta sync/insights/webhook jobs reuse this contract unchanged; no
Meta-specific worker authorization model is introduced. See `meta-sync.md` §2 and
`meta-webhooks.md` §5 for the one open structural question this raises (whether Meta webhooks
extend the existing `workers/webhook` package or need a distinct one).

## 7. What This Document Does Not Define

Concrete request/response JSON shapes, the Prisma migration, the actual adapter implementation,
and the final OpenAPI contract are out of scope for Phase 3A — see `meta-api-contracts.md` §4
and `phase-3-implementation-sequence.md`.
