# Multi-Tenant Security
**Document ID:** SEC-005 | Version 1.0

## Mandatory Controls
- workspace ID on tenant-owned data
- scoped repository methods
- server-side membership checks
- object-level authorization
- cache isolation
- job isolation
- report isolation
- audit isolation

## Cross-Tenant Negative Tests
Attempt:
- changing workspace ID in request body
- replacing internal resource ID
- using another workspace's Meta external ID
- replaying a report URL
- injecting another workspace ID into AI chat
- manipulating worker payloads

Every attempt must fail safely.

## Tenant Context
Tenant context is established by authenticated membership, not by a user-provided workspace ID alone.
