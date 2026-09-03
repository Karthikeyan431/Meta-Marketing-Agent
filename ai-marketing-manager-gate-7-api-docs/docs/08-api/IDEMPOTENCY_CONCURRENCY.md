# Idempotency and Concurrency
**Document ID:** API-005 | Version 1.0

## Idempotency
Required for operations where duplicate execution could cause:
- spend changes
- duplicate creation
- repeated state changes
- external side effects

Use an idempotency key bound to:
- authenticated actor
- workspace
- operation
- request fingerprint

A reused key with different parameters must fail.

## Concurrency
Sensitive updates should use:
- version numbers
- ETags/If-Match
- optimistic locking
- or equivalent domain concurrency control

## Action Execution
The action record is the source of truth for whether an execution has already been attempted.
