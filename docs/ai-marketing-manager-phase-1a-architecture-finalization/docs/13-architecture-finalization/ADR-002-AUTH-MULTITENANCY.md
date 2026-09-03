# ADR-002 — Authentication and Multi-Tenancy
**Status:** Proposed

Use an external identity provider with application-managed workspace membership, roles and resource authorization.

Authorization chain:
`Authenticated User → Workspace Membership → Role Permission → Resource Scope → Action Policy → Approval Policy`

All enforcement is server-side. Frontend checks are UX only.
