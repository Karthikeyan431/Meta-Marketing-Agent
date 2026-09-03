# Component Architecture
**Document ID:** ARCH-002 | **Version:** 1.0

## Frontend
- Authentication/session UI
- Workspace selector
- Chat interface
- Campaign dashboard
- Reports
- Goals
- Optimization center
- Approvals
- Audit viewer
- Integration settings

## Backend Application
### Identity Module
Users, sessions, authentication integration.

### Workspace Module
Workspaces, memberships, settings and tenant boundaries.

### Authorization Module
Permission evaluation and resource ownership.

### Meta Module
OAuth, account connections, assets and Meta API adapter.

### Sync Module
Pull orchestration, reconciliation and freshness tracking.

### Analytics Module
Canonical metrics, aggregations and comparisons.

### Chat Module
Conversation persistence, request lifecycle and streaming status.

### AI Orchestrator
Intent handling, context assembly, tool selection and structured output.

### Tool Registry
Typed read/write tools exposed to AI.

### Governance
Policy, limits, approvals and emergency stop.

### Goals
Goal lifecycle, KPI definitions and progress.

### Optimization
Opportunity detection, candidate decisions and action history.

### Reporting
Report generation and delivery.

### Audit
Immutable-style application audit records.

## Worker Components
- Meta sync worker
- Insights worker
- Webhook worker
- Optimization worker
- Report worker
- Maintenance worker

Workers must be safe to retry.
