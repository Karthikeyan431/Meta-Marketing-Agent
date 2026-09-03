# Chat and AI API
**Document ID:** API-007 | Version 1.0

## Send Message
`POST /api/v1/conversations/{conversationId}/messages`

Request example:

```json
{
  "content": "Show me campaigns with CPL above ₹800 this month."
}
```

Response may be synchronous for simple requests or return an AI run for asynchronous processing.

## AI Run
An AI run tracks:
- conversation
- initiating user
- workspace
- model route
- status
- tool calls
- action ID when applicable
- final outcome
- safe usage metadata

## Streaming
If streaming is implemented:
- authenticate before stream creation
- authorize conversation
- do not stream secrets
- emit structured lifecycle events
- close stream on authorization/session failure

## Truthfulness
The final response must derive execution state from application records, not model claims.
