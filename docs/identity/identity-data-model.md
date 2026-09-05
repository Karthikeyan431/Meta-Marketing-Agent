# Identity Data Model

**Document ID:** IDENT-010 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

**This is a schema design, not a migration.** No Prisma model is added to
`packages/domain/prisma/schema.prisma` in this phase, and no migration is generated — per
the Hard Restrictions, this is Phase 2 implementation scope. This document exists so Phase
2 can implement directly from an approved design rather than inventing the schema at
commit time.

## 1. Role/Permission Storage: Enum+Table Hybrid, With Reasoning

`ERD_SPECIFICATION.md` (DATA-002) explicitly leaves this open: "roles/permissions if
implemented dynamically" is listed as a conditional identity table. `SCHEMA_DESIGN.md`
(DATA-003) shows `workspace_memberships.role` as a single field without specifying its
type.

**Recommendation: a hybrid.**

- `Membership.role` is a **Postgres enum** (`OWNER | ADMIN | MANAGER | ANALYST | VIEWER`,
  matching `rbac.md` §1) — not a foreign key to a fully dynamic roles table. A fixed,
  small, code-reviewed role set is simpler, faster to query, and matches the actual
  product requirement (`rbac.md` explicitly rejects inventing a fully dynamic
  custom-role system this phase, mirroring the reasoning already used for Clerk's own
  custom-role feature not being adopted — `clerk-integration.md` finding #6).
- **Permissions are a relational lookup**, not hardcoded in application code as a
  switch statement: a `Permission` table (the catalog in `rbac.md` §3) and a
  `RolePermission` mapping table (`role` enum value × `permission_id`) let the
  role→permission matrix be data (queried once at startup or cached), not scattered
  `if (role === 'ADMIN' || role === 'OWNER')` checks throughout the codebase. This gives
  two concrete benefits without the complexity of fully dynamic roles: (1) the matrix in
  `rbac.md` §3 can be seeded directly as data, keeping code and documentation from
  drifting apart, and (2) it leaves room for the per-membership override use case flagged
  as an open decision in `rbac.md` §5, without a schema change — an override is just an
  additional row keyed by `membership_id` rather than `role`, reusing the same
  `Permission` foreign key.

This directly answers the required "reasoning" for enum vs. relational vs. hybrid: **enum
for the small, stable, product-defined role set; relational for the permission catalog and
its mapping, because permissions are numerous, need to be queried/audited as data, and may
need per-membership overrides later without a schema migration.**

## 2. Entities (design-level field list — not Prisma syntax, to avoid implying a ready-to-apply migration)

### `users`

- `id` (internal PK)
- `clerk_user_id` (unique, external identity reference — never used as an authorization
  key on its own, per `authorization.md` §2's external-ID rule applied to identity too)
- `display_name`, `email` (mirrored from Clerk per `identity-sync.md` §1; email stored per
  `SCHEMA_DESIGN.md`'s "email metadata as required" — exact fields TBD at implementation,
  minimized per `DATA_SECURITY.md`)
- `deleted_at` / status marker (soft-delete per `identity-sync.md` §5)
- `created_at`, `updated_at`

### `workspaces`

- `id` (internal PK)
- `clerk_org_id` (nullable unique — nullable because the Clerk-Organization mapping is a
  proposed, not required, decision per `workspace-model.md` §2; the workspace model must
  function with this column null)
- `name`, `status`, `timezone`, `configuration` (JSON, non-relational settings only, per
  `SCHEMA_DESIGN.md`)
- `created_at`, `updated_at`

### `workspace_memberships`

- `id` (internal PK)
- `workspace_id` (FK → workspaces)
- `user_id` (FK → users)
- `role` (enum: OWNER/ADMIN/MANAGER/ANALYST/VIEWER)
- `status` (active/suspended/removed)
- `created_at`, `updated_at`
- **Unique constraint:** `workspace_id + user_id` (per `SCHEMA_DESIGN.md`, unchanged)

### `permissions` _(new — not in the original SCHEMA_DESIGN.md draft, added by this phase)_

- `id` (internal PK)
- `key` (unique string, e.g. `campaign.update` — the catalog in `rbac.md` §3)
- `resource_group` (e.g. `campaigns`, `budget` — for grouping/display, not an
  authorization field itself)

### `role_permissions` _(new)_

- `role` (enum, matches `Membership.role`)
- `permission_id` (FK → permissions)
- **Unique constraint:** `role + permission_id` — this table is the queryable form of the
  `rbac.md` §3 matrix.

### `membership_permission_overrides` *(new — schema placeholder only, for the open

per-membership-override decision in `rbac.md` §5; not populated or read by any code this
phase)*

- `membership_id` (FK → workspace_memberships)
- `permission_id` (FK → permissions)
- `granted` (boolean — allows both additive grants and explicit revocations of a role
  default, if that flexibility is ever approved)

## 3. What Is Deliberately Not Designed Yet

- `meta_connections`, `ad_accounts`, `campaigns`, `ad_sets`, `ads`, `creatives`, `insights`,
  `conversations`, `messages`, `ai_runs`, `ai_tool_calls`, `actions`, `approvals`, `goals`,
  `optimization_*`, `reports`, `audit_events` — all already specified at the field level in
  `SCHEMA_DESIGN.md`/`ERD_SPECIFICATION.md`, and explicitly **not** re-designed or migrated
  in this phase ("do not create the complete Meta/campaign schema yet"). Their eventual
  `workspace_id` column is what `multi-tenancy.md` §1/§3 already documents; this phase adds
  only the identity tables those future tables will reference.
- Sessions are **not** mirrored into our own database at all (`identity-sync.md` §1's
  `session.*` row) — Clerk is the sole source of session validity.

## 4. Indexing Notes (for Phase 2 implementation, per `INDEXING_AND_CONSTRAINTS.md`'s

general rule of indexing by actual access pattern, not blanket)

- `workspace_memberships (user_id)` — resolving "which workspaces does this user belong
  to" for the workspace-switcher/active-workspace-resolution flow (`workspace-model.md`
  §3).
- `workspace_memberships (workspace_id, status)` — resolving active membership lists
  per workspace.
- `users (clerk_user_id)` — unique, used on every `requireAuth()` call.
- `workspaces (clerk_org_id)` — unique (where non-null), used by `identity-sync.md`'s
  webhook/reconciliation upserts.
