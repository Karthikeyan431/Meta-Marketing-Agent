# AI Marketing Manager — API Architecture
**Document ID:** API-001 | Version 1.0 | Status: Draft for Approval

## Purpose
Define the production backend API contract between web clients, AI services, workers and integration services.

## API Principles
- Contract-first development.
- Version public APIs.
- Validate all input server-side.
- Authorize every request and object.
- Keep provider-specific Meta schemas behind an adapter.
- Use stable application error codes.
- Use idempotency for financial-impacting mutations.
- Never expose secrets.
- Correlate requests with trace IDs.

## High-Level Architecture

```text
Web / Mobile Client
       ↓ HTTPS
API Gateway / Edge
       ↓
Application API
 ├── Auth
 ├── Workspaces
 ├── Meta Connections
 ├── Campaigns
 ├── Insights
 ├── Chat / AI
 ├── Actions
 ├── Approvals
 ├── Reports
 └── Webhooks
       ↓
Domain Services
       ↓
DB / Queue / Meta Adapter / AI Runtime
```

## API Version
Initial public API: `/api/v1`.

Breaking changes require a new major API version.
