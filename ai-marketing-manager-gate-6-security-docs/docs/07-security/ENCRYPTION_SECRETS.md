# Encryption and Secrets Management
**Document ID:** SEC-011 | Version 1.0

## In Transit
Use TLS for external and internal communications where applicable.

## At Rest
Encrypt:
- credentials
- sensitive database data where required
- backups
- report artifacts containing sensitive information

## Key Management
Prefer managed KMS/secret-management infrastructure.

Separate:
- application secrets
- database credentials
- Meta credentials
- signing keys
- encryption keys

## Rotation
Document rotation schedules and emergency rotation procedures.

## Secret Hygiene
Secrets must not appear in:
- source control
- CI logs
- application logs
- traces
- prompts
- error messages
- screenshots/test fixtures
