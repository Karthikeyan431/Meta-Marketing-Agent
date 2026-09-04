# Local Development

## Prerequisites

- Node.js 22+ (this repo was built/verified on Node 24 — see `.nvmrc`)
- pnpm 10.29.2 (`corepack enable && corepack prepare pnpm@10.29.2 --activate`, or `npm i -g pnpm@10.29.2`)
- Docker Desktop (for local PostgreSQL + Redis via `infrastructure/docker-compose.yml`) —
  **or** a native PostgreSQL 17+ and Redis installation if you'd rather not use Docker

## 1. Install dependencies

```bash
pnpm install
```

This also runs `postinstall`, which generates the Prisma client — you don't need a
separate step for that on a fresh install.

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if your local Postgres/Redis ports differ from the defaults (see the comment
above `DATABASE_URL` in `.env.example` — it assumes the Docker Compose Postgres, mapped
to host port `5433` to avoid clashing with a natively-installed Postgres on `5432`).

## 3. Start local dependencies

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Or point `DATABASE_URL` / `REDIS_URL` in `.env` at your own local Postgres/Redis instead.

## 4. Set up the database

```bash
pnpm run db:migrate:dev
```

Creates and applies the `pgcrypto`-extension migration against your local database. Safe
to re-run — Prisma no-ops if there's nothing new to apply.

## 5. Run the app

In separate terminals:

```bash
pnpm run dev:api          # Fastify API on http://localhost:4000
pnpm run dev:web          # Next.js on http://localhost:3000
pnpm run dev:worker:sync  # example: the sync worker (health on :4101)
```

Every worker has an equivalent `pnpm --filter @ai-marketing-manager/worker-<name> run dev`.

Verify: `curl http://localhost:4000/health` and `curl http://localhost:4000/ready` should
both return `200` once Postgres and Redis are reachable. `scripts/check-health.mjs` can
poll multiple URLs at once:

```bash
node scripts/check-health.mjs http://localhost:4000/health http://localhost:4000/ready
```

## 6. Run the tests

```bash
pnpm run test:unit          # no external dependencies required
pnpm run test:integration   # requires Postgres + Redis reachable (steps 3-4 above)
pnpm run test:e2e:install   # first time only — installs Playwright's browser binary
pnpm run test:e2e           # boots the web app itself via Playwright's webServer config
```

## 7. Lint, format, typecheck, build

```bash
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm run build               # apps/api + every worker (tsc verification build)
pnpm --filter @ai-marketing-manager/web run build   # Next.js production build
```

## 8. Docker

```bash
docker build -f apps/api/Dockerfile -t amm-api .
docker build -f apps/web/Dockerfile -t amm-web .
docker build -f workers/Dockerfile --build-arg WORKER_NAME=sync --build-arg HEALTH_PORT=4101 -t amm-worker-sync .
```

Each image's `HEALTHCHECK` hits its own `/health` endpoint — `docker ps` will show
`healthy`/`unhealthy` once the container has been up for its start period.

## Troubleshooting

- **`DATABASE_URL is required` / `REDIS_URL is required` at startup** — you skipped step 2;
  every service validates its environment at startup and fails fast with the specific
  missing variable name (never its value) rather than booting half-configured.
- **Port 5432 already in use when starting Docker Compose** — you likely have a native
  Postgres running too; this is expected and handled by mapping to `5433` (see decision
  #11 in `architecture-decisions.md`). If your `DATABASE_URL` still points at `5432`,
  update it.
- **Integration tests fail with connection errors** — confirm
  `docker compose -f infrastructure/docker-compose.yml ps` shows both services `healthy`
  before running `pnpm run test:integration`.
