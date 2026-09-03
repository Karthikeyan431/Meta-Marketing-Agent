# AI Observability
**Document ID:** AI-010 | **Version:** 1.0

## Trace
Each AI task should be traceable using:
- request ID
- workspace ID
- conversation ID
- AI run ID
- tool-call IDs
- action ID where applicable

## Metrics
- latency
- model/token usage
- tool calls per task
- task success
- clarification rate
- error rate
- mutation approval rate
- mutation failure rate
- policy rejection rate
- estimated AI cost

## Logs
Log operational metadata, not secrets.

## Privacy
Raw conversation/model content should be retained only according to approved product/privacy policy.
