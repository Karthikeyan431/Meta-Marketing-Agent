# Worker Architecture
**Document ID:** ARCH-005 | **Version:** 1.0

## Purpose
Move long-running, scheduled and retryable operations out of request/response paths.

## Worker Types
### Sync Worker
Synchronizes Meta accounts/assets/campaign hierarchy.

### Insights Worker
Synchronizes performance data.

### Webhook Worker
Processes Meta webhook events.

### Optimization Worker
Evaluates goals and permitted optimization opportunities.

### Report Worker
Builds large or scheduled reports.

### Maintenance Worker
Retention, cleanup, reconciliation and operational tasks.

## Reliability
- At-least-once delivery is assumed.
- Job handlers must be idempotent.
- Retry transient failures.
- Do not retry permanent authorization/policy failures indefinitely.
- Record terminal failure.
- Use dead-letter handling where supported.

## Concurrency
Use workspace/ad-account scoped locks or equivalent coordination where simultaneous mutations could conflict.
