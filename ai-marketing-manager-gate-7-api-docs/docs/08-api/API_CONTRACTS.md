# API Contract Standards
**Document ID:** API-003 | Version 1.0

## Request
JSON by default.

Every mutation request should include a request/correlation identifier where appropriate.

## Response Envelope
Successful single resource:

```json
{
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

Collection:

```json
{
  "data": [],
  "meta": {
    "request_id": "...",
    "next_cursor": "..."
  }
}
```

## Error Envelope

```json
{
  "error": {
    "code": "ACTION_NOT_ALLOWED",
    "message": "This action is not permitted.",
    "request_id": "..."
  }
}
```

Do not expose internal stack traces, credentials or provider secrets.

## Dates
Use ISO 8601 timestamps.

## Money
Never use floating point for monetary persistence or policy evaluation. Use integer minor units or an exact decimal representation plus currency.

## IDs
Use opaque internal identifiers in application APIs. External Meta IDs may be exposed only when product requirements explicitly need them.
