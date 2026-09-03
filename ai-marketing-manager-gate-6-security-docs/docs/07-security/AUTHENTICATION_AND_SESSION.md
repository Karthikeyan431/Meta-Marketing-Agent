# Authentication and Session Security
**Document ID:** SEC-003 | Version 1.0

## Authentication
Use one centrally managed, well-supported authentication mechanism.

Production requirements:
- verified identity
- secure account recovery
- optional/required MFA according to risk tier
- login abuse detection
- security event logging
- re-authentication for sensitive operations where appropriate

## Session
Use secure, server-controlled sessions.

Requirements:
- high-entropy session identifiers
- HTTPS only
- Secure cookie
- HttpOnly where cookie-based sessions are used
- appropriate SameSite policy
- inactivity timeout
- absolute lifetime
- session revocation
- session rotation after authentication/privilege changes
- no session tokens in URLs

OWASP ASVS specifically treats session uniqueness, invalidation and timeout as core requirements.

## Sensitive Re-authentication
Consider step-up authentication for:
- changing security settings
- connecting/disconnecting Meta
- changing financial limits
- approving high-risk actions
- emergency-stop administration

## Device/session Management
Users should be able to view and revoke active sessions in a production-grade implementation.
