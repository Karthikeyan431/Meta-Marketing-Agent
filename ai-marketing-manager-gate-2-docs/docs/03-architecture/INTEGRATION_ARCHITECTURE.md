# Integration Architecture
**Document ID:** ARCH-007 | **Version:** 1.0

## Integration Boundary
All third-party systems are accessed through explicit adapters.

### Meta
OAuth + Marketing/Insights capabilities + webhooks.

### AI Provider
LLM inference through an application-owned AI gateway.

### Infrastructure
PostgreSQL, Redis, object storage and observability services.

## AI Gateway Responsibilities
- model routing
- request limits
- structured output enforcement
- prompt/version tracking
- safety filters where applicable
- token/cost accounting
- trace IDs
- timeout/error handling

## Meta Adapter Responsibilities
- token handling
- request construction
- rate-limit handling
- response normalization
- API-version isolation
- error classification
- capability detection
- request tracing without secrets

## Rule
Application/domain code should not depend on provider-specific response formats when a canonical model is appropriate.
