# Synchronization Data Model
**Document ID:** DATA-006 | **Version:** 1.0

## Sync Run
Every sync operation records:
- sync ID
- workspace
- connection
- resource type
- scope
- requested range
- status
- attempt
- start/end timestamps
- source coverage
- error classification

## Reconciliation
For each synchronized resource:
1. fetch external records
2. normalize
3. upsert by external identity
4. update source timestamp
5. mark observed
6. reconcile missing/stale resources according to policy

## Idempotency
Repeated syncs must not create duplicate canonical entities.

## Partial Failure
A partial page/API failure must not falsely mark the entire synchronization as complete.

## Freshness
Consumers must be able to determine whether data is:
- current
- delayed
- stale
- unavailable

## Webhooks
Webhook events should be persisted before asynchronous processing when practical. Duplicate webhook delivery must be safe.
