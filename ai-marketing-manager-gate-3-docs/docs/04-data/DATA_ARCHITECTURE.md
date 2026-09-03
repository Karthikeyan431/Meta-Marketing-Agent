# AI Marketing Manager — Data Architecture
**Document ID:** DATA-001 | **Version:** 1.0 | **Status:** Draft for Approval

## 1. Purpose
Define the canonical persistence model for a multi-tenant AI advertising platform.

## 2. Primary Store
PostgreSQL is the canonical transactional database.

Supporting stores may include:
- Redis for ephemeral caching, locks and queue support
- Object storage for generated report artifacts where required
- Observability storage for telemetry

No secondary store is authoritative for transactional business state.

## 3. Data Domains
1. Identity
2. Workspace
3. Authorization
4. Integration
5. Meta Assets
6. Performance/Insights
7. Conversations
8. AI Runs
9. Actions
10. Approvals
11. Goals
12. Optimization
13. Reports
14. Audit
15. Jobs

## 4. Tenant Boundary
Workspace is the primary tenant boundary.

Every tenant-owned record must have a workspace identifier directly or through an explicitly controlled parent relationship.

All repository queries must enforce workspace scope.

## 5. External Identity
External Meta IDs are stored separately from internal primary keys.

Rule:
- Internal UUID/ID = application identity.
- Meta external ID = integration identity.

Never expose internal database IDs unnecessarily to users.

## 6. Data Lifecycle
```text
Meta API
  ↓
Raw/External Mapping
  ↓
Canonical Entity
  ↓
Analytics/Derived Metrics
  ↓
AI Context
  ↓
Action/Decision
  ↓
Outcome
```

## 7. Consistency
- Transactional state uses PostgreSQL transactions.
- Synchronization is eventually consistent with explicit freshness.
- Derived analytics may be recomputed.
- Audit records are append-oriented.
- External state is never assumed to match internal state after a mutation until verification succeeds.

## 8. Data Freshness
Sync records must capture:
- requested time
- started time
- completed time
- source timestamp where available
- status
- error state
- data coverage

## 9. Soft Delete
Use explicit lifecycle status where external entities may disappear or become inaccessible. Avoid immediate destructive deletion of records required for reconciliation/audit.
