# Multi-Tenancy Model

**Document ID:** IDENT-004 | Version 1.1 | Status: Approved (Owner Decision, 2026-09-05) | Phase: 2A (Architecture Finalization)

Workspace is the tenant boundary for the entire application. This document makes
`DATA-004` (TENANT_ISOLATION.md) and `SEC-005` (TENANT_SECURITY.md) concrete for every
resource type currently in scope.

## 1. Tenant Ownership Tree

```text
Workspace
 ├── Members (via Membership)
 ├── Meta Connections
 ├── Ad Accounts
 ├── Campaigns
 │    ├── Ad Sets
 │    │    └── Ads
 │    │         └── Creatives
 ├── Reports
 ├── AI Conversations
 │    ├── Messages
 │    └── AI Runs
 │         └── AI Tool Calls
 ├── Goals
 ├── Optimization Runs
 │    └── Optimization Opportunities
 ├── Actions
 │    └── Approvals
 ├── Audit Events
 └── Jobs (sync runs, webhook events, background job records)
```

Every node in this tree carries a direct or single-hop-indirect `workspace_id` (per
`SCHEMA_DESIGN.md`'s common-columns rule: tenant-owned tables carry `id`, `workspace_id`,
`created_at`, `updated_at`). No tenant-owned resource is ever globally addressable by its
own ID alone — see `authorization.md` §2 for the mechanical query rule this implies.

## 2. Isolation Model

**Shared schema, workspace-scoped rows.** Every tenant-owned table lives in one shared
PostgreSQL schema; isolation is enforced by an application-layer `workspace_id` predicate
on every query, not by separate schemas or databases per tenant. This matches
`DATA_ARCHITECTURE.md`'s target model and is the only isolation strategy consistent with a
single modular-monolith deployment (`ADR-001-MODULAR-MONOLITH`).

**Defense in depth, not defense in only one layer:**

1. **Application-layer authorization is mandatory** — every repository method and query
   must require an authorized workspace context (`DATA-004` rule #3; `authorization.md`
   §1's `requireResourceAccess()`).
2. **Database-level row-level security (RLS) may be added as an additional layer** but
   must never be the _only_ enforcement point or a substitute for #1 (`DATA-004` §Defense
   in Depth). **DEFERRED to Phase 11 (owner decision, 2026-09-05 —
   `phase-2a-owner-decision-package.md` OD-04):** Postgres RLS is not implemented during
   Phase 2; #1 (application-layer enforcement) remains mandatory and is never replaced by
   RLS, consistent with `DATA-004`.

## 3. Rules Restated Per Resource Class

| Resource class                                                    | Workspace relationship                                                                          | Special note                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta connections, ad accounts, campaigns, ad sets, ads, creatives | Direct `workspace_id` (ad sets/ads/creatives also carry the parent chain)                       | External Meta IDs are unique **within** a workspace (`workspace_id + external_id`), never globally — a Meta external ID from workspace A must never resolve to a row in workspace B, even if the raw Meta ID value collides (`DATA-004` rule #10, `META_OBJECT_MODEL.md`). |
| Reports                                                           | Direct `workspace_id`                                                                           | A report URL/identifier is not a capability token — retrieval re-runs the full authorization chain, not just "does this report ID exist" (`DATA-004` rule #8).                                                                                                             |
| AI conversations/messages/runs/tool calls                         | Direct `workspace_id` on conversations; inherited via `conversation_id`/`ai_run_id` on children | AI context construction is itself workspace-scoped at the retrieval layer — the AI is never handed a raw cross-workspace query result to "figure out" what's relevant (`DATA-004` rule #6).                                                                                |
| Actions, Approvals                                                | Direct `workspace_id`                                                                           | An approval binds to an exact action version/hash within one workspace; it cannot be replayed against a different workspace's action even if IDs were somehow reused (`SEC-009`).                                                                                          |
| Audit events                                                      | Direct `workspace_id`                                                                           | Audit reads are workspace-scoped like any other resource (`DATA-004` rule #9) — an audit event is not a special globally-readable record.                                                                                                                                  |
| Background jobs (sync runs, webhook events)                       | Direct `workspace_id` on the job record                                                         | The workspace scope on a job is established at **enqueue time** by already-authorized code, then **re-verified** by the worker at execution time — see `authorization.md` §4.                                                                                              |
| Cache entries                                                     | Workspace ID is part of the cache key itself                                                    | Never key a cache entry by resource ID alone (`DATA-004` rule #7).                                                                                                                                                                                                         |

## 4. Cross-Tenant Negative Test Catalog (must all fail safely)

Carried forward verbatim from `TENANT_SECURITY.md` and `TENANT_ISOLATION.md`, to be
implemented as automated tests starting in Phase 2:

1. Changing the workspace ID in a request body while keeping a valid session for a
   _different_ workspace.
2. Substituting another workspace's internal resource ID directly in a URL path.
3. Using another workspace's Meta external ID to address a resource.
4. Replaying a report URL/ID obtained (legitimately or otherwise) from a different
   workspace context.
5. Injecting another workspace's ID into an AI chat message or conversation context.
6. Manipulating a worker's job payload to claim a different workspace scope than it was
   enqueued with.
7. Direct ID substitution against any resource-scoped endpoint not explicitly listed above.
8. Cache-key collision attempts (requesting the same resource ID across two different
   workspace contexts and confirming no cached response leaks across the boundary).

Every one of these must resolve to `403`/`404` per `authorization.md` §3, never a
partial success, a 500 that leaks internal state, or — worst of all — a successful
cross-tenant read/write.

## 5. What Is Explicitly Not a Tenant Boundary

- A **user** is not a tenant boundary — a single user may hold memberships in many
  workspaces, and nothing about their identity implies which workspace a given request is
  for (see `workspace-model.md`).
- A **Clerk Organization**, even if used as a 1:1 mirror of a Workspace (see
  `workspace-model.md`'s recommendation), is not itself the enforcement mechanism —
  our own `workspace_memberships` table is (`clerk-integration.md` §2).
- **Role** alone is not a tenant boundary — an OWNER of workspace A has zero standing
  authorization in workspace B; role is evaluated _after_ membership is confirmed, never
  as a substitute for it.
