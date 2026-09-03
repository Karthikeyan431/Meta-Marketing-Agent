# API Observability
**Document ID:** API-013 | Version 1.0

## Correlation
Propagate:
- request ID
- trace ID
- workspace ID
- user ID where permitted
- AI run ID
- action ID
- Meta operation ID where available

## Metrics
- request latency
- error rate
- authorization failures
- rate-limit events
- mutation outcomes
- queue latency
- Meta API failures
- AI latency

## Logging
Structured logs only. Never log credentials, session secrets or sensitive request bodies by default.
