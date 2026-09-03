# Backend Architecture
**Document ID:** ARCH-003 | **Version:** 1.0

## Recommended Shape
Modular monolith with explicit domain modules and asynchronous workers.

## Layering
```text
Transport
  ↓
Application Services
  ↓
Domain
  ↓
Ports / Interfaces
  ↓
Infrastructure Adapters
```

## Rules
- Controllers/handlers remain thin.
- Business rules live in application/domain services.
- External API calls are isolated behind adapters.
- Database access is not scattered across UI or AI code.
- Authorization occurs before resource access and mutation.
- Transactions are used for state changes that require atomicity.

## External Adapter Pattern
```text
MetaPort
  |
  +-- MetaOAuthAdapter
  +-- MetaMarketingApiAdapter
  +-- MetaWebhookAdapter
```

The domain must not depend directly on Meta SDK implementation details.

## Background Jobs
Jobs should contain:
- job ID
- workspace ID
- job type
- payload reference
- attempt count
- status
- timestamps
- error metadata

## Idempotency
Mutating commands should accept or derive an idempotency key and persist execution state sufficiently to prevent duplicate external actions.
