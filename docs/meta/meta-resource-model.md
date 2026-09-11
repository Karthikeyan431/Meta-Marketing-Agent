# Meta Resource Model (Identifier Model + Ad Hierarchy)

**Document ID:** META-107 | Version 1.2 | Status: §4's `Ad Account` field set implemented (Phase 3.2); Campaign/Ad Set/Ad field sets implemented 2026-09-11 (Phase 4.1, read-only); Creative remains denormalized onto Ad, never its own table | Phase: 3A (Architecture Finalization, closed); Phase 3.2/4.1 (Implementation, complete)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_OBJECT_MODEL.md` (META-003)
and `ai-marketing-manager-gate-3-docs/docs/04-data/SCHEMA_DESIGN.md` (DATA-003)'s existing
field-level `ad_accounts`/`campaigns`/`ad_sets`/`ads` designs. Conceptual only — no migration
for Campaign/Ad Set/Ad/Creative (Phase 4.1+ scope); §4's `Ad Account` field set was
implemented as the `AdAccount` Prisma model in Phase 3.2 — see
`phase-3-2-implementation-report.md` §5 for the exact schema and its (minor, documented)
naming reconciliation against this section.

## 1. Application ID vs. Meta External ID (from META-003, unchanged)

Every Meta-sourced entity in this application has **two** identities:

- **Internal primary key** — the application's own opaque ID, the only identifier any API
  route, permission check, or AI tool ever accepts from a client as a resource reference.
- **External Meta ID** — Meta's own ID for the object, stored for round-tripping to the Meta
  API, never used as an authorization key, and never sufficient on its own to resolve or
  access a resource.

**Never use an external Meta ID as the sole application authorization key.** The recommended
conceptual model, restated from the governing task:

```
internal primary key
  +
workspace scope
  +
external provider ID
```

This mirrors the already-shipped pattern in this codebase exactly: `WorkspaceMembership` has
its own `id`, is always scoped by `workspaceId`, and separately carries `userId` (an internal
reference, itself carrying `clerkUserId` as its own external identity) — Meta resources follow
the identical shape, not a new one.

## 2. Uniqueness (conceptual)

Per-table uniqueness: `workspace_id + external_id`, matching `SCHEMA_DESIGN.md`'s existing rule
for `ad_accounts`/`campaigns` (and, by the same reasoning, `ad_sets`/`ads`). This guarantees
the same Meta external ID can exist independently in two different workspaces without
collision, and guarantees a client can never address another workspace's resource by supplying
a real, valid-but-foreign external ID — the lookup is always `WHERE workspace_id = <authorized>
AND external_id = <claimed>`, identical in shape to this project's existing
`requireResourceAccess()` mechanical rule (`docs/identity/authorization.md` §2), applied here
to Meta resources for the first time.

## 3. Ad Hierarchy (from META-003, unchanged)

```
Meta Business / Access Context
  ↓
Ad Account         (meta-account-discovery.md)
  ↓
Campaign
  ↓
Ad Set
  ↓
Ad
  ↓
Creative
```

Every level below Ad Account carries: internal ID, `workspaceId`, external Meta ID, parent
internal ID (never only a parent external ID — resolving the parent must go through the
same workspace-scoped lookup as any other resource), source/provider tag, lifecycle status,
`source_updated_at` (Meta's own last-modified signal, when available), `last_synced_at`
(this application's own sync timestamp — distinct from `source_updated_at`, since a sync can
run without the source actually having changed).

## 4. Field Sets (from `SCHEMA_DESIGN.md`, restated for this phase's reconciliation)

- **Ad Account**: `id, workspaceId, metaConnectionId, externalId, name, currency, timezone,
status, lastSyncedAt`.
- **Campaign**: `id, workspaceId, adAccountId, externalId, name, status, effectiveStatus,
objective, budget fields, start/end metadata, sourceUpdatedAt, lastSyncedAt`.
- **Ad Set / Ad**: "same tenant/external identity strategy" as Campaign, referencing their
  immediate parent (`SCHEMA_DESIGN.md`'s own phrasing) — internal parent ID, not external.
- **Creative**: immutable once created on Meta's side (live-verified, `meta-app-review.md` §1
  / `TECH_STACK.md`'s 2026-09-04 finding, unchanged this pass — "a new creative must be created
  to change one") — the application model must reflect this immutability rather than modeling
  creative "updates" that Meta itself does not support.

## 5. Lifecycle State / Deleted-or-Archived Handling

Meta resources are never hard-deleted locally when they disappear from a sync pass — mirroring
this project's existing `WorkspaceMembership` soft-delete convention (`status: REMOVED`, never
a row deletion). A campaign/ad set/ad no longer returned by Meta is marked with a lifecycle
status reflecting that (e.g. an `EXTERNALLY_REMOVED`-shaped status, exact naming deferred to
Phase 4.1's schema work), preserving historical Insights data association (§`meta-insights.md`)
rather than orphaning it.

## 6. Cross-Workspace Isolation (restates `meta-architecture.md` §2 / `meta-connection-model.md`

§5, the single most safety-critical rule in this document)

A user must not be able to access a Meta Ad Account, Campaign, Ad Set, or Ad merely by knowing
its ID — account ID, business ID, campaign ID, ad set ID, or ad ID. Every lookup resolves
through `workspaceId` first (already-authorized via `requireWorkspaceMembership()`), then the
target resource's own `workspaceId` foreign key is checked to match — identical mechanical
shape to `requireResourceAccess()`, applied to five new resource types. See
`meta-threat-model.md` threats #6–#8 for the specific attack scenarios this rule closes.
