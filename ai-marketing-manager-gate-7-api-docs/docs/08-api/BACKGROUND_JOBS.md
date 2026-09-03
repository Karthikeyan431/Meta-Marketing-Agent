# Background Jobs and Async API
**Document ID:** API-010 | Version 1.0

## Queue-Based Work
Use asynchronous jobs for:
- initial Meta sync
- scheduled sync
- Insights ingestion
- webhook processing
- report generation
- autonomous optimization
- long-running action execution

## Job Envelope
Every job carries:
- job ID
- job type
- workspace
- initiating actor/system identity
- correlation ID
- resource scope
- retry metadata
- idempotency key where applicable

## Reliability
- bounded retries
- exponential backoff
- dead-letter handling
- idempotent consumers
- observability
- cancellation for eligible jobs

Workers must not trust arbitrary client-provided job payloads.
