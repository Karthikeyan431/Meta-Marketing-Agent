# @ai-marketing-manager/domain

Canonical data model package (Prisma + PostgreSQL), per ADR-003-CANONICAL-DATA-MODEL and
`docs/ai-marketing-manager-gate-3-docs/docs/04-data/DATA_ARCHITECTURE.md`.

## Phase 1 scope

This package currently contains **zero business models**. It exists only to prove the
database connectivity and migration workflow end-to-end, per the Phase 1 task's explicit
instruction not to prematurely implement the complete business schema.

The only migration present enables the `pgcrypto` PostgreSQL extension, which every future
table will need for UUID primary keys (per the canonical-ID convention in ADR-003). This is
a genuine foundational change, not a placeholder table.

## What's deferred to Phase 2 (Identity & Multi-Tenancy)

`users`, `workspaces`, `workspace_memberships`, and the RBAC role/permission tables are
explicitly out of scope here — see `docs/implementation/implementation-plan.md` Phase 2 and
`docs/ai-marketing-manager-gate-3-docs/docs/04-data/SCHEMA_DESIGN.md` for their target shape.
They should be added deliberately in Phase 2, informed by the finalized Clerk integration
(ADR-002 in `docs/ai-marketing-manager-phase-1a-architecture-finalization/`), not inferred
here.

## Commands

```bash
pnpm --filter @ai-marketing-manager/domain run generate       # regenerate the Prisma client
pnpm --filter @ai-marketing-manager/domain run migrate:dev     # create + apply a dev migration
pnpm --filter @ai-marketing-manager/domain run migrate:deploy  # apply pending migrations (CI/prod)
pnpm --filter @ai-marketing-manager/domain run migrate:status  # check migration status
```

Requires `DATABASE_URL` to be set — see `.env.example` at the repo root.
