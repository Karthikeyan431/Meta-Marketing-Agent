# Meta Integration Testing
**Document ID:** TEST-005 | Version 1.0

## Test Modes
### Mock
Fast automated tests with deterministic provider responses.

### Contract
Validate adapter assumptions against documented provider schemas.

### Integration
Use approved Meta test/development resources where available.

### Production Smoke
After deployment, perform minimal read-only health checks before enabling mutations.

## Scenarios
- token invalid
- permission insufficient
- account unavailable
- rate limit
- timeout
- malformed provider response
- partial failure
- mutation accepted
- mutation accepted but verification delayed
- mutation verification mismatch

Never use real production advertising spend for automated destructive tests.
