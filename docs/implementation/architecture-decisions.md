# Architecture Decisions — Phase 1 Foundation

Every place Phase 1 deviates from, or fills a gap left open by, the recommended
structure in `docs/ai-marketing-manager-gate-11-development-readiness/.../REPOSITORY_STRUCTURE.md`
and the accepted ADRs in `docs/ai-marketing-manager-phase-1a-architecture-finalization/`.
Per the task instructions: "Document every significant deviation from the architecture."

## 1. API framework: Fastify (not specified by any prior gate)

ADR-001-TECHNOLOGY-STACK.md names Node.js + TypeScript for the API but no specific
framework. Fastify was chosen for: native TypeScript-friendly plugin architecture with
proper encapsulation (fits the "typed interfaces" / modular-monolith principle), built-in
JSON schema validation hooks, first-class support for injecting a custom logger instance
(used to wire the shared `@ai-marketing-manager/config` logger), and low overhead. No
architecture document required this specific choice or forbade an alternative (e.g.
Express, Hono) — this is recorded as a decision, not inferred as already approved.

## 2. `packages/domain` hosts Prisma (not a separate `packages/database`)

The recommended structure lists `packages/{contracts,domain,ui,config}` — no `database`
package. Since ADR-003-CANONICAL-DATA-MODEL.md defines `packages/domain` as the home of
the canonical data model, and Prisma's schema **is** that canonical model's concrete
implementation, the Prisma schema/client/migrations live there rather than inventing an
unlisted package. See `packages/domain/README.md`.

## 3. New package: `packages/queue` (not in the recommended list)

The recommended structure has no shared package for the BullMQ/worker bootstrap pattern
needed by all six workers plus the API's readiness check. Duplicating this logic six-plus
times, or folding it into `packages/config` (which is about env/logging, a different
concern), both seemed worse than one small, clearly-scoped addition. Documented here per
the task's explicit "adapt this structure where technically justified" allowance.

## 4. Internal packages ship TypeScript source directly — no per-package build step

`packages/config`, `contracts`, `domain`, `ui`, and `queue` all set `"main"`/`"exports"`
to point at `src/index.ts` rather than a compiled `dist/`. They are never published and
are always consumed inside this monorepo by a tool that already transpiles TypeScript at
the point of use — Next.js (webpack/Turbopack) for `apps/web`, `tsx` for `apps/api` and
every worker, Vitest (Vite) for tests. Adding a build step (and the ordering complexity of
"build packages before consumers can typecheck/run") would buy nothing at this stage.
This is a common, accepted pattern for internal-only monorepo packages.

## 5. `apps/api` and every worker run via `tsx` in production, not a compiled `dist/`

Each of these apps still has a real `build` script (`tsc -p tsconfig.build.json`) that
fully typechecks and emits — useful as a standalone verification step and for future use —
but the `start` script (used by both `pnpm dev`/`start` and the Docker `CMD`) runs
`tsx src/*.ts` directly. Reason: these apps depend on the source-only internal packages
above (decision #4); a plain `node dist/server.js` in the Docker image would try to
`import` from e.g. `@ai-marketing-manager/config`, which resolves via that package's
`exports` field to a `.ts` file — something plain `node` cannot load without relying on
Node's still-young native TypeScript support. Running everything through `tsx`
consistently (a pinned, deterministic dependency) avoids that fragility entirely. A later
hardening phase can introduce a proper multi-stage compiled build once the API surface is
stable enough to be worth the added toolchain complexity — this is a deliberate
foundation-phase simplification, not an oversight.

## 6. Docker images copy the whole monorepo into the install stage, then copy wholesale

`apps/api/Dockerfile` and `workers/Dockerfile` copy the entire repository into a `deps`
stage, run `pnpm install --frozen-lockfile` there (so pnpm's per-package `node_modules`
symlinks are created against the real, complete source layout), then copy the whole
resulting `/app` directory wholesale into the `runtime` stage. This trades some image size
(devDependencies are present in the final image) for a build that doesn't require
manually reconstructing pnpm's symlink structure package-by-package, which is a common
source of broken monorepo Docker builds. `apps/web/Dockerfile` does not have this problem —
Next's `output: "standalone"` build performs its own dependency tracing and produces a
genuinely minimal runtime image. Slimming the api/worker images (e.g. via `pnpm deploy`
or a pruned lockfile) is deferred to a later hardening pass.

## 7. One generic `workers/Dockerfile`, not six near-identical ones

Parameterized by `--build-arg WORKER_NAME=<name> --build-arg HEALTH_PORT=<port>` rather
than duplicating the same Dockerfile six times. See `workers/README.md`.

## 8. Worker health/readiness is a dependency-free `node:http` server, not Fastify

Workers aren't HTTP services; pulling in a full web framework just to expose `/health`
and `/ready` would be a heavier dependency than the job warrants. `@ai-marketing-manager/config`'s
`createHealthServer` uses Node's built-in `http` module directly — same liveness/readiness
split as the API, without the extra dependency.

## 9. `tests/integration` and `tests/unit` are real pnpm workspace packages

Needed so their `@ai-marketing-manager/*` imports resolve correctly through pnpm's
per-package `node_modules` symlinks rather than relying on hoisting to the workspace
root. `tests/contract`, `tests/security`, and `tests/ai-evals` are plain folders with a
README each (no code yet, so no package.json needed) — see their READMEs for what lands
there and in which phase.

## 10. `apps/api` exposes `./app` and `./env` package subpath exports

Added so integration tests can import the real `buildApp()`/`loadApiEnv()` functions
(and exercise them via Fastify's `.inject()`, no port bound) rather than either
duplicating app-construction logic in tests or spawning a real child process per test run.

## 11. Local dev PostgreSQL uses host port 5433, not 5432

`infrastructure/docker-compose.yml` maps its Postgres container to `5433:5432` because
this development machine already has a native PostgreSQL 17 service bound to the default
port. `.env.example`'s `DATABASE_URL` matches this. A machine without a conflicting local
install can just as validly run the compose Postgres on 5432 — adjust `DATABASE_URL`
accordingly; nothing in the application hardcodes the port.

## 12. Local dev Redis mapped to host port 6380, not 6379

Found during Phase 1 verification closure: integration tests intermittently failed with
`ECONNRESET`/timeouts against Redis, even though `docker exec <container> redis-cli ping`
returned `PONG` — i.e., the container itself was healthy. Root cause, confirmed via
`netstat`/`Get-Process`: on this development machine, `wslrelay.exe` (a WSL2 networking
process entirely unrelated to this project or Docker Desktop) was independently bound to
IPv6 loopback port `6379`, alongside Docker's own legitimate port-forward. Depending on
which address Node's connection attempt resolved to, `redis://localhost:6379` sometimes
reached the real Redis container and sometimes reached the unrelated process, producing
exactly the flaky symptoms observed. Remapping the compose service to host port `6380`
(same pattern as decision #11's Postgres remap) resolves it deterministically. This is a
machine-specific port collision, not an application or Docker configuration defect.
