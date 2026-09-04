# syntax=docker/dockerfile:1
#
# Phase 1 simplification, documented in docs/implementation/architecture-decisions.md:
# the whole monorepo is copied into the `deps` stage and installed there so pnpm's
# per-package node_modules symlinks are correctly created against the real source
# layout, then the entire result is copied wholesale into `runtime`. This trades some
# image size (devDependencies are present) for a build that is simple and correct.
# Slimming this to a `pnpm deploy`-pruned image is a later hardening-phase task, not a
# Phase 1 blocker.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["pnpm", "run", "start"]
