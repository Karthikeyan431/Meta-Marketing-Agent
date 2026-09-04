# syntax=docker/dockerfile:1
#
# Generic worker image, parameterized by WORKER_NAME — one Dockerfile for all six
# logical workers (see workers/README.md) instead of six near-identical copies.
# Build per worker:
#   docker build -f workers/Dockerfile --build-arg WORKER_NAME=sync --build-arg HEALTH_PORT=4101 -t amm-worker-sync .
#
# Same "copy everything, install once" simplification as apps/api/Dockerfile — see that
# file's header comment and docs/implementation/architecture-decisions.md.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS runtime
ARG WORKER_NAME
ARG HEALTH_PORT=4100
ENV NODE_ENV=production
ENV HEALTH_PORT=${HEALTH_PORT}
COPY --from=deps /app /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /app/workers/${WORKER_NAME}
EXPOSE ${HEALTH_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${HEALTH_PORT}/health" || exit 1

CMD ["pnpm", "run", "start"]
