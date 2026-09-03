# ADR-001 — Technology Stack
**Status:** Proposed

## Target Stack
- TypeScript
- Next.js + React for web
- Node.js + TypeScript for API
- PostgreSQL
- Prisma
- Zod + OpenAPI contracts
- Vitest
- Playwright
- pnpm workspaces
- Docker

Use one primary language to enable shared contracts and domain types. Claude must inspect the repository before scaffolding and must not overwrite a superior existing implementation.
