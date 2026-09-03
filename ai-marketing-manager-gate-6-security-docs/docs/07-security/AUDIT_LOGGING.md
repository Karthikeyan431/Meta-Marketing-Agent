# Audit and Security Logging
**Document ID:** SEC-012 | Version 1.0

## Audit Events
Capture security-relevant actions such as:
- login/security events
- Meta connection changes
- permission changes
- action proposals
- policy decisions
- approvals
- Meta mutations
- verification outcomes
- emergency-stop changes
- configuration changes

## Required Metadata
- event ID
- workspace
- actor type
- actor ID when available
- event type
- resource
- action ID where applicable
- timestamp
- outcome
- trace/correlation ID
- safe metadata

## Never Log
- access tokens
- passwords
- encryption keys
- session tokens
- full sensitive payloads without explicit justification

## Audit Integrity
Restrict modification/deletion privileges and maintain append-oriented behavior. Audit history required for security/compliance must not depend on normal business-record deletion.
