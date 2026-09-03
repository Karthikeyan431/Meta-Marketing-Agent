# ADR-004 — Asynchronous Long-Running Operations
**Status:** Proposed

## Decision
Synchronization, scheduled optimization, large reports and other long-running work execute through workers rather than blocking HTTP requests.

## Rationale
Improves reliability, retryability, user experience and independent scaling.
