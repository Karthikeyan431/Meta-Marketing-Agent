# Meta Integration Test Strategy
**Document ID:** META-009 | Version 1.0

## Test Levels

### Unit
- request mapping
- response normalization
- error classification
- pagination
- idempotency
- token state transitions

### Integration
- OAuth callback
- token validation
- account discovery
- campaign sync
- insights sync
- webhook processing
- mutation execution
- verification

### Contract
Validate expected Meta API schemas and version behavior.

### Failure
- expired token
- revoked permission
- rate limit
- timeout
- malformed response
- partial pagination
- duplicate webhook
- external not-found
- conflicting update

### Security
- OAuth CSRF/state failure
- tenant crossing
- credential leakage
- webhook spoofing
- arbitrary endpoint/tool injection

## UAT
Users must validate:
- connect Meta
- see accounts
- search campaigns naturally
- inspect performance
- preview mutation
- approve mutation
- verify changed state
- receive truthful failure messaging
