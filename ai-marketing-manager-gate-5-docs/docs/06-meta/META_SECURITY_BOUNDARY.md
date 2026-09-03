# Meta Security Boundary
**Document ID:** META-008 | Version 1.0

## Rules
- Browser never stores Meta access credentials.
- AI never receives Meta credentials.
- AI never constructs arbitrary Meta HTTP requests.
- Every mutation passes authorization/policy.
- Every external operation is attributable to user/system actor.
- Logs redact credentials.
- Webhook authenticity is validated.
- External IDs do not grant access.

## Emergency Stop
Emergency stop blocks:
- new autonomous mutations
- queued eligible mutations
- scheduled optimization execution

Read operations may remain available unless security policy requires broader isolation.
