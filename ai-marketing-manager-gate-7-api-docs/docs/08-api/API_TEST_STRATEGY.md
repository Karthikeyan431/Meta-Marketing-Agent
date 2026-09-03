# API Test Strategy
**Document ID:** API-014 | Version 1.0

## Unit
- validators
- authorization
- error mapping
- pagination
- idempotency
- action state transitions

## Integration
- authentication
- workspace access
- CRUD
- chat
- approval
- Meta adapter
- webhooks
- jobs

## Contract
Validate OpenAPI/API schema compatibility.

## Negative
- missing auth
- invalid auth
- cross-tenant resource
- insufficient role
- expired approval
- replayed idempotency key
- malformed payload
- oversized request
- rate limit
- provider failure

## Security
Automated tests must cover BOLA/IDOR and tenant isolation on every resource family.
