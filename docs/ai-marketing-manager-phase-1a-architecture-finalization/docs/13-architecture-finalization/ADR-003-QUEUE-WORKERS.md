# ADR-003 — Queue and Worker Architecture
**Status:** Proposed

Use Redis-backed BullMQ initially.

Logical workers:
- Sync
- Insights
- Optimization
- Report
- Webhook
- Maintenance

Jobs must be observable, retry-safe, bounded, and idempotent where possible. PostgreSQL remains the source of truth.
