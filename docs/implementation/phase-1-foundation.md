# Phase 1 — Foundation

**Status:** Complete, pending your review. STOP point per the Phase 1 task — do not start Phase 2 without explicit approval.

## What this phase builds

A production-grade engineering **foundation only**: a pnpm monorepo with strict
TypeScript, a Fastify API with health/readiness/error/validation/logging/security
plumbing, a Next.js App Router shell, a Redis+BullMQ queue/worker bootstrap pattern (six
workers, one of them running a real harmless proof-of-concept job), a PostgreSQL+Prisma
foundation with zero business tables, Docker images for all three runtime shapes,
GitHub Actions CI, and this documentation set.

No Meta integration, no AI integration, no authentication, no business schema, and no
campaign/ad functionality exist yet — all explicitly deferred per the task's Hard
Restrictions. See `architecture-decisions.md` for every deviation from the recommended
structure and why, and the top-level `README.md` for the full repository map.

## Repository structure

```text
apps/
  api/          Fastify API foundation — /health, /ready, error envelope, validation
                helper, request-ID correlation, structured logging, security middleware
  web/          Next.js App Router shell — layout, error/loading/not-found boundaries,
                a11y + responsive baseline, typed API client foundation
packages/
  config/       env schema/loader, logger factory, correlation IDs, graceful-shutdown
                orchestration, dependency-free HTTP health server
  contracts/    shared API envelope + health/readiness Zod schemas and types
  domain/       Prisma schema (pgcrypto extension only — no business tables yet) + DB
                client singleton + health check
  ui/           minimal shared component package (one accessibility utility component)
  queue/        BullMQ connection/queue/worker bootstrap abstraction, the harmless
                example job, and the placeholder processor used by unimplemented workers
workers/
  sync/ insights/ optimization/ report/ webhook/  bootstrap-only, placeholder processor
  maintenance/   the one worker with a real (harmless) job processor
services/
  ai/ meta/     intentionally empty — see their README.md files
tests/
  unit/         cross-cutting unit tests (plus unit tests colocated in each package)
  integration/  API health/readiness, PostgreSQL, Redis, BullMQ enqueue/consume
  e2e/          Playwright baseline against the web app shell
  contract/ security/ ai-evals/   empty, with READMEs explaining what lands there and when
migrations/     README pointing to packages/domain/prisma/migrations (Prisma's real location)
infrastructure/ docker-compose.yml for local Postgres+Redis; Terraform explicitly deferred
scripts/        check-health.mjs — polls health/readiness URLs until ready or timeout
.github/workflows/ci.yml   install -> lint -> typecheck -> unit -> integration -> build
                            -> e2e -> secret scan -> dependency audit
```

## Dependencies added

Root-level tooling: TypeScript 5.7 (strict), ESLint 9 (flat config) + typescript-eslint,
Prettier, Vitest 3 (projects: unit/integration), Playwright, dotenv, tsx.

App/package-level: Fastify 5 (+helmet, rate-limit, cors, fastify-plugin), Zod, Pino
(+pino-pretty), Prisma 6 + `@prisma/client`, BullMQ + ioredis, Next.js 15, React 19.

No AI SDK, no auth SDK (Clerk), no Meta SDK — none of that is used this phase.

## Database changes

One migration: enables the PostgreSQL `pgcrypto` extension (needed by every future
table for UUID primary keys, per ADR-003-CANONICAL-DATA-MODEL). Zero business tables —
see `packages/domain/README.md` for why, and what's explicitly deferred to Phase 2.

## Documentation set

- `docs/implementation/phase-1-foundation.md` — this file
- `docs/implementation/architecture-decisions.md` — every deviation from the recommended structure, justified
- `docs/implementation/local-development.md` — how to run everything locally
- `docs/implementation/testing.md` — test strategy, what's covered, what's deferred

## Known issues / blockers

See the final Phase 1 report delivered alongside this documentation for the full
Definition-of-Done checklist, exact verification commands and results, and any
outstanding blockers discovered during verification.
