# Frontend Architecture
**Document ID:** UI-014 | Version 1.0

## Layers

```text
Pages / Routes
      ↓
Feature Components
      ↓
Domain UI State
      ↓
API Client
      ↓
Backend API
```

## Rules
- no direct Meta API calls from browser
- central API client
- typed request/response contracts
- centralized auth/session handling
- query caching with workspace-aware keys
- mutation invalidation
- optimistic UI only where rollback is safe
- action status must come from server state

## State Categories
- server state
- local UI state
- conversation state
- action state
- session state

Do not duplicate server truth unnecessarily in local state.
