# Identity & Multi-Tenancy Architecture

**Document ID:** IDENT-001 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

This is the master document for the `docs/identity/` set. It resolves the open sub-decision
recorded in the Phase 1A `ARCHITECTURE_DECISION_REGISTER.md` ("ADR-002: no specific
identity-provider vendor is named — must be resolved before Phase 2") and elaborates the
authorization chain already required by `SEC-004` (RBAC_AUTHORIZATION.md) and `API-006`
(AUTHORIZATION_MODEL.md) into an implementable design.

**This is architecture and documentation only.** No Clerk package is installed, no
credentials are created, no migration is written, and no authorization code exists yet —
see Hard Restrictions in `phase-2a-gate-checklist.md`.

## 1. The Authorization Chain

```text
Clerk (identity/session provider)
  ↓
Authenticated User            — Clerk userId, valid session
  ↓
Application User              — our users row, keyed by clerkUserId
  ↓
Workspace                     — the tenant boundary (see workspace-model.md)
  ↓
Workspace Membership          — proves this user belongs to this workspace
  ↓
Application Role              — OWNER / ADMIN / MANAGER / ANALYST / VIEWER (see rbac.md)
  ↓
Permission                    — workspace.read, campaign.update, budget.approve, ... (see rbac.md)
  ↓
Resource Authorization        — does the specific resource_id belong to this workspace? (see authorization.md)
  ↓
Action Policy                 — financial/risk policy, approval requirement (Phase 9 scope; foundation only here)
```

Every layer below "Authenticated User" is **owned by our own PostgreSQL database**, never
by Clerk. This is the single most important architectural rule in this document set and is
restated in every other document in `docs/identity/`: **Clerk proves who is asking. Our
database decides what they may do.**

## 2. Non-Negotiable Principles (carried forward, not reinvented)

These already exist in the approved SDLC corpus; this phase does not change them, only
makes them concrete for identity/multi-tenancy specifically:

1. Authorization is evaluated at a trusted server-side service layer, never in frontend
   code and never inferred from middleware alone (`SEC-004`; confirmed independently by
   current Clerk documentation — see `clerk-integration.md` finding #3).
2. A client-supplied workspace ID, resource ID, or any other identifier is **never**
   treated as proof of authorization (`DATA-004` rule 4, `TENANT_SECURITY.md` §Tenant
   Context).
3. Every protected query against tenant-owned data carries an explicit workspace-scoping
   condition — `WHERE id = requestedId AND workspace_id = authorizedWorkspaceId`, never
   `WHERE id = requestedId` alone (`API-006`, restated for IDOR/BOLA prevention in
   `authorization.md`).
4. Background workers are not exempt from authorization — they must carry a verified,
   non-forgeable workspace scope, not an ambient "internal" trust level (`DATA-004` rule 5,
   `SEC-004` §Background Jobs).
5. AI is never the authorization boundary. A tool call executes with the **initiating
   user's own current permissions**, re-checked per call, never a standing or elevated
   privilege (`SEC-004` §AI, `AI-007`, `ADR-002-AI-EXECUTION-BOUNDARY`). See `authorization.md`
   §6 for the concrete boundary diagram.
6. Financial/budget mutation permissions are necessarily narrower than general campaign
   management permissions and additionally gated by policy/approval machinery that is
   **out of scope for Phase 2** (`SEC-010`; full pipeline is Phase 9). This phase defines
   only the permission _names_ (`budget.read/propose/approve/execute`) and the rule that
   holding `campaign.update` never implies holding any `budget.*` permission.

## 3. Document Map

| Document                     | Covers                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `identity-architecture.md`   | This file — the chain, the principles, the map                                       |
| `authentication.md`          | Clerk session lifecycle, authentication states, step-up auth                         |
| `authorization.md`           | `requireXxx()` primitive contracts, 401/403/404 policy, IDOR/BOLA rule, AI boundary  |
| `multi-tenancy.md`           | Workspace-as-tenant model, isolation rules, negative-test catalog                    |
| `rbac.md`                    | Role model, permission matrix, role→permission reasoning                             |
| `clerk-integration.md`       | Live-verified current Clerk documentation findings and the exact integration pattern |
| `workspace-model.md`         | User/Workspace/Membership relational model, workspace switching                      |
| `identity-sync.md`           | Clerk webhook/event synchronization and reconciliation design                        |
| `identity-threat-model.md`   | Phase 2 threat table (threat/attack/control/detection/test)                          |
| `identity-data-model.md`     | Prisma schema design for identity tables (no migration created)                      |
| `identity-api-contracts.md`  | Endpoint-level authorization contracts, example routes                               |
| `phase-2a-decisions.md`      | The required decision table with rationale                                           |
| `phase-2a-gate-checklist.md` | Gate approval checklist (unchecked, pending owner review)                            |

## 4. Relationship to the Existing SDLC Corpus

This document set **implements** (does not replace) the following already-approved target
architecture:

- `docs/ai-marketing-manager-gate-3-docs/docs/04-data/TENANT_ISOLATION.md` (DATA-004)
- `docs/ai-marketing-manager-gate-3-docs/docs/04-data/SCHEMA_DESIGN.md` (DATA-003) — `users`, `workspaces`, `workspace_memberships` table shapes
- `docs/ai-marketing-manager-gate-6-security-docs/docs/07-security/RBAC_AUTHORIZATION.md` (SEC-004)
- `docs/ai-marketing-manager-gate-6-security-docs/docs/07-security/TENANT_SECURITY.md` (SEC-005)
- `docs/ai-marketing-manager-gate-6-security-docs/docs/07-security/AUTHENTICATION_AND_SESSION.md` (SEC-003)
- `docs/ai-marketing-manager-gate-7-api-docs/docs/08-api/AUTHORIZATION_MODEL.md` (API-006)
- `docs/ai-marketing-manager-phase-1a-architecture-finalization/docs/13-architecture-finalization/ADR-002-AUTH-MULTITENANCY.md`

Where this document set makes a decision those documents deliberately left open (e.g. the
specific identity-provider vendor, the exact role list), it says so explicitly and records
it in `phase-2a-decisions.md` rather than silently overriding the source document.

## 5. STOP

Per the governing task, Phase 2A stops here. Nothing in this document set authorizes
writing code, installing `@clerk/nextjs`, creating a Clerk application/credentials, or
creating a Prisma migration. See `phase-2a-gate-checklist.md`.
