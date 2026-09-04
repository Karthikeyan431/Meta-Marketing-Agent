# Testing — Phase 1 Foundation

Per `docs/ai-marketing-manager-gate-9-testing-docs/docs/10-testing/TESTING_ARCHITECTURE.md`'s
test pyramid (Unit -> Integration/Contract -> E2E -> UAT/Manual), scoped to what Phase 1
actually has to test.

## Unit tests (`pnpm run test:unit`)

No external dependencies required. Colocated with the code they test (e.g.
`packages/config/src/env.test.ts`) plus cross-cutting tests under `tests/unit/`. Covers:

- Environment validation (`packages/config/src/env.test.ts`) — defaults, explicit values,
  and that invalid config throws with the field name but never the value.
- Correlation ID generation (`packages/config/src/correlation.test.ts`).
- Graceful-shutdown orchestration (`packages/config/src/shutdown.test.ts`) — concurrency,
  partial-failure handling, and timeout behavior, tested directly against the pure
  orchestration function rather than by sending real OS signals (which would kill the
  test runner itself).
- Request body validation (`apps/api/src/plugins/validation.test.ts`) — success path,
  the 400 error envelope shape, and multi-field error reporting.
- Structural consistency (`tests/unit/queue-worker-consistency.test.ts`) — the six
  `QUEUE_NAMES` in `packages/queue` and the six `workers/*` directories never drift apart.

## Integration tests (`pnpm run test:integration`)

Requires real PostgreSQL and Redis (see `local-development.md`). Runs the real
application code, not mocks:

- `tests/integration/api-health.test.ts` — builds the actual Fastify app (`buildApp()`,
  the same function `server.ts` calls) and exercises `/health`, `/ready`, an unknown
  route's 404 envelope, and baseline security headers via `.inject()` — no port bound.
- `tests/integration/database.test.ts` — real `SELECT 1` against `DATABASE_URL`.
- `tests/integration/redis.test.ts` — real `PING` against `REDIS_URL`.
- `tests/integration/queue.test.ts` — the BullMQ proof-of-concept: enqueues a real
  `example-ping` job onto the `maintenance` queue and confirms an in-process worker
  (running the same processor `workers/maintenance` runs) picks it up and completes it.

## E2E tests (`pnpm run test:e2e`)

Playwright, against the real Next.js dev server (`playwright.config.ts`'s `webServer`
starts it automatically). `tests/e2e/shell.spec.ts` covers the application shell only —
no campaign/chat screens exist yet:

- Home page renders with the correct title, skip link, and `<main>` landmark.
- The skip link is keyboard-focusable (accessibility baseline).
- An unknown route renders the custom not-found page, not a raw error.

## Deferred (empty folders with a README explaining why + when)

| Folder            | Lands in                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `tests/contract/` | Phase 5 (API) — once an OpenAPI spec exists to validate against   |
| `tests/security/` | Grows starting Phase 2 (tenant isolation), full suite in Phase 11 |
| `tests/ai-evals/` | Phase 8 (AI Read-Only) — once an `AIProvider` and tools exist     |

Phase 1's own security baseline (helmet headers, rate limiting, CORS, body size limits,
safe error envelopes) is verified in `tests/integration/api-health.test.ts` rather than
a separate `tests/security` suite, since there's no authorization/tenant surface yet to
warrant a dedicated security-test layer.

## CI (`.github/workflows/ci.yml`)

Runs, in order, on every push to `main` and every PR: install -> lint -> format check ->
typecheck -> apply DB migrations -> unit tests -> integration tests (real Postgres/Redis
service containers) -> build (api + workers) -> build web -> E2E -> secret scan
(gitleaks) -> dependency vulnerability scan (`pnpm audit --audit-level=high`). Any stage
failing fails the whole workflow — no deployment stages exist yet.
