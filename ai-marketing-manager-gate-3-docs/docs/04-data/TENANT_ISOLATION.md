# Tenant Isolation
**Document ID:** DATA-004 | **Version:** 1.0

## Mandatory Rules
1. Workspace ID is required for tenant-owned data.
2. Authorization is checked before access.
3. Repository methods should require workspace context.
4. Never accept a workspace ID from the client as proof of authorization.
5. Background jobs must carry verified workspace scope.
6. AI context must be constructed only from authorized workspace data.
7. Cache keys must include workspace scope.
8. Reports must be workspace-scoped.
9. Audit events must be workspace-scoped.
10. External IDs must never be used to bypass tenant checks.

## Defense in Depth
Application authorization is mandatory.

Database-level row security may be considered as an additional defense, but must not replace application authorization.

## Negative Testing
Test:
- direct ID substitution
- cross-workspace external IDs
- manipulated chat references
- worker payload tampering
- cache-key collisions
- report URL/resource access
