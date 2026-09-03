# MVP Scope
**Document ID:** PROD-003 | **Version:** 1.0 | **Status:** Draft for Approval

## Included
1. Authentication and workspace
2. RBAC
3. Meta OAuth and connection management
4. Meta asset discovery
5. Campaign hierarchy synchronization
6. Performance/Insights synchronization
7. Dashboard
8. AI chat
9. Read-only analytics tools
10. Selected campaign mutations
11. Policy engine
12. Approval engine
13. Audit logging
14. Goal engine
15. Bounded optimization
16. Reports
17. Observability
18. Testing and deployment foundations

## MVP Mutation Set
Initial candidate set; final support depends on current Meta API capability verification:
- pause campaign
- resume campaign
- pause/resume supported lower-level entities
- update supported budget fields
- create selected campaign structures
- update selected supported settings

No unsupported operation should be simulated.

## MVP Safety Boundary
Autonomous execution is disabled by default. The workspace owner must explicitly configure permitted autonomous behavior and financial limits.

## MVP Exit Criteria
- Critical workflows pass UAT.
- No known critical security defects.
- No known cross-tenant authorization defect.
- No financial-limit bypass.
- Core Meta synchronization is reliable.
- AI mutation path is fully audited.
- Production deployment and rollback are tested.
