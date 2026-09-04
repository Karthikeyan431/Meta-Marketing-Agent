# migrations

Prisma-managed migrations for the canonical data model live at
`packages/domain/prisma/migrations/`, next to `schema.prisma` — this is where Prisma's
own CLI tooling (`prisma migrate dev`, `prisma migrate deploy`) requires them to be, and
splitting the schema from its migrations would break that tooling.

This top-level directory is kept, per the repository's recommended structure, as the
place for anything **not** managed by Prisma's own migration engine: one-off manual SQL
scripts for high-risk/staged production changes
(`docs/ai-marketing-manager-gate-3-docs/docs/04-data/DATA_MIGRATIONS.md`'s "destructive
migrations are staged separately" rule), and future non-Postgres migration concerns if
any arise. It is empty as of Phase 1.
