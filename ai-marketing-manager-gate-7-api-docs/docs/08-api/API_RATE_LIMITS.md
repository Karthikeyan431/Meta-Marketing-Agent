# API Rate Limits and Quotas
**Document ID:** API-012 | Version 1.0

## Suggested Initial Policy
Exact limits should be load-tested and tuned before production.

Categories:
- authentication
- chat
- read APIs
- mutation APIs
- report generation
- sync requests
- admin operations

## Response
Use standard rate-limit semantics and safe retry guidance.

## AI
Apply both request and tool-call budgets to prevent expensive loops.

## Meta
Provider rate limits are separate from application rate limits. The Meta adapter must protect both sides.
