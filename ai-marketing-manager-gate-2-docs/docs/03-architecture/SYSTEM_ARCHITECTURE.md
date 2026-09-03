# AI Marketing Manager — System Architecture
**Document ID:** ARCH-001 | **Version:** 1.0 | **Status:** Draft for Approval

## 1. Architectural Goal
Provide a secure, scalable, observable architecture in which conversational AI can operate Meta advertising without receiving unrestricted external API access.

## 2. Recommended MVP Architecture
Use a **modular monolith + asynchronous workers**.

```text
Web App
  |
  v
API / BFF
  |
  +--> Auth & Workspace
  +--> Chat Orchestrator
  +--> Goal Engine
  +--> Reporting
  +--> Governance / Policy
  +--> Meta Domain Adapter
  |
  +--> PostgreSQL
  +--> Redis
  +--> Job Queue
          |
          +--> Meta Sync Worker
          +--> Insights Worker
          +--> Optimization Worker
          +--> Report Worker
          +--> Webhook Worker
  |
  +--> Meta APIs
  +--> AI Provider
```

## 3. Trust Boundaries
### Boundary A — Browser to Application
All privileged operations are server-authorized.

### Boundary B — AI to Application Tools
The model can request typed tools but cannot directly access credentials or arbitrary network endpoints.

### Boundary C — Application to Meta
Meta access occurs through a dedicated integration layer with scoped credentials.

### Boundary D — External Data to AI
Meta-derived names, text, creative content and reports are untrusted data. They must never be interpreted as system authority.

## 4. Core Modules
- Identity
- Workspace
- Authorization
- Meta Integration
- Asset Registry
- Synchronization
- Insights
- Chat
- AI Orchestration
- Tool Registry
- Policy Engine
- Approval Engine
- Goal Engine
- Optimization Engine
- Reporting
- Audit
- Notifications
- Observability

## 5. Request Classification
Every chat request must be classified as:
- informational
- analytical
- planning
- mutating
- administrative
- unsupported/ambiguous

The classification must not itself grant permissions.

## 6. Read Path
Chat → intent/context → authorization → data retrieval tool → canonical data → response.

## 7. Mutation Path
Chat → intent → entity resolution → structured action plan → authorization → policy → approval if required → execution adapter → verification → audit → response.

## 8. Autonomous Path
Scheduler → goal evaluation → fresh data check → opportunity detection → candidate action → policy → approval/auto-approval → execution → verification → measurement → audit.

## 9. Failure Strategy
- Timeout external calls.
- Retry only retryable failures.
- Use exponential backoff.
- Use idempotency protection for mutations.
- Record failures.
- Never report unverified success.
- Escalate persistent failures to an observable error state.

## 10. Scaling Strategy
Initially scale stateless API instances horizontally and workers independently. PostgreSQL remains the canonical store. Redis is used for ephemeral cache/coordination/queue support as appropriate.

## 11. Availability
The system must degrade safely:
- Meta unavailable → preserve existing synchronized data with freshness indicators.
- AI unavailable → normal dashboards and deterministic functions remain usable.
- Worker failure → jobs remain recoverable.
- Policy service failure → mutations fail closed.

## 12. Architectural Rule
The AI layer is an orchestration layer, not the security boundary. Deterministic application services remain the final authority for permissions, policies, limits and execution.
