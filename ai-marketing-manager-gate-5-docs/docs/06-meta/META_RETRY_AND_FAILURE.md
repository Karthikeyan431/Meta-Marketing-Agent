# Meta Retry and Failure Strategy
**Document ID:** META-007 | Version 1.0

## Retry
Retry only:
- transient provider failures
- network failures
- rate-limit responses where retry is appropriate

Do not blindly retry:
- invalid credentials
- permission denial
- validation errors
- unsupported operations

## Backoff
Use exponential backoff with jitter and bounded attempts.

## Circuit Protection
Repeated provider failures for one account should reduce pressure on Meta and surface a degraded connection state.

## Partial Bulk Operation
Each item must have an explicit outcome:
- succeeded
- failed
- skipped
- not attempted

Never collapse partial execution into “success”.
