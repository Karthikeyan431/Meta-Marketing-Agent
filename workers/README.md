# Workers

Six logical workers per `docs/ai-marketing-manager-gate-2-docs/docs/03-architecture/WORKER_ARCHITECTURE.md`
and `ADR-003-QUEUE-WORKERS.md`: `sync`, `insights`, `optimization`, `report`, `webhook`, `maintenance`.

## Phase 1 scope

Every worker boots, connects to Redis via `@ai-marketing-manager/queue`, exposes `/health`
and `/ready` over HTTP, logs structured lifecycle events, and shuts down gracefully on
SIGTERM/SIGINT. This proves the worker bootstrap pattern end-to-end.

**Only `maintenance` has a real job processor** — a harmless `example-ping` job used to
verify enqueue → process → complete works (see `tests/integration/queue.test.ts`). The
other five (`sync`, `insights`, `optimization`, `report`, `webhook`) run a placeholder
processor that fails loudly if a job ever reaches them, since nothing should enqueue to
them yet. Their real job types land in the phases that need them:

| Worker         | Real job types land in                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| `sync`         | Phase 4 — Core Meta Data                                                             |
| `webhook`      | Phase 4 — Core Meta Data                                                             |
| `insights`     | Phase 4 — Core Meta Data                                                             |
| `optimization` | Phase 9 — Controlled AI Actions                                                      |
| `report`       | Phase 10 — Reporting                                                                 |
| `maintenance`  | Phase 1 (this phase) — proof-of-concept only; real housekeeping jobs added as needed |
