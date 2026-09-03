# Production Observability
**Document ID:** DEVOPS-009 | Version 1.0

## Three Pillars
- logs
- metrics
- traces

## Business Signals
Monitor:
- Meta sync failures
- action failure rate
- verification failures
- approval backlog
- AI tool errors
- report failures
- webhook backlog
- tenant isolation/auth failures
- provider rate limits

## Correlation
Carry request ID, trace ID, workspace ID, AI run ID and action ID where appropriate.
