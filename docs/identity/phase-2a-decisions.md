# Phase 2A Decisions

**Document ID:** IDENT-012 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

## 1. Required Decision Table

| Decision                  | Recommendation                                                                    | Status                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity provider         | Clerk                                                                             | Proposed — resolves Phase 1A's open ADR-002 sub-decision; see `clerk-integration.md` for live verification |
| Workspace representation  | Clerk Organization + application Workspace (1:1, `clerk_org_id` reference column) | Proposed — cost implication (free-tier MRO limits) not yet owner-approved; see §2 below                    |
| Application authorization | Application-owned (our database, never Clerk Organization roles/permissions)      | Proposed                                                                                                   |
| Role model                | Application-owned: OWNER/ADMIN/MANAGER/ANALYST/VIEWER                             | Proposed — reconciles `SEC-004`'s illustrative 6-role example; see `rbac.md` §1                            |
| Permission model          | Application-owned, enum role + relational permission/role-mapping hybrid          | Proposed — see `identity-data-model.md` §1 for full reasoning                                              |
| Resource authorization    | Server-side (`requireResourceAccess()`, `WHERE id AND workspace_id`)              | **Required** — non-negotiable per existing `API-006`/`DATA-004`                                            |
| Tenant isolation          | Workspace-scoped, shared schema, application-layer enforcement + optional RLS     | **Required** — application layer; RLS itself remains optional (see §2)                                     |
| Identity synchronization  | Webhook (`verifyWebhook()`) + periodic reconciliation                             | Proposed                                                                                                   |
| AI authorization          | Application-owned; AI never selects a workspace or holds standing privilege       | **Required** — non-negotiable per existing `ADR-002-AI-EXECUTION-BOUNDARY`/`AI-007`                        |

## 2. Additional Open Decisions Surfaced During This Phase

These were identified while designing the documents above and are not resolvable by
Claude Code alone — each names the document where it's raised in context.

| #   | Open decision                                                                                                                    | Where raised                                   | Recommendation (non-binding)                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clerk plan/tier — free-tier MRO limits (50 dev / 100 production) apply if Organizations = Workspaces 1:1                         | `clerk-integration.md` finding #5              | Accept free tier for Phase 2 (well under 100 tenants at MVP stage); revisit before any growth push toward that ceiling.                                                                  |
| 2   | Whether to use Clerk Organizations at all, vs. Clerk for individual identity only with Workspace existing solely in our database | `workspace-model.md` §2                        | Use the 1:1 mapping (gives Clerk-native org-switcher/invite UI for free) unless the owner has a specific reason to avoid Clerk Organizations.                                            |
| 3   | `APPROVER` as a distinct role vs. a permission (`budget.approve`) grantable to any role                                          | `rbac.md` §1                                   | Permission-based (as designed) — composes better, avoids a role-combination problem this phase doesn't solve.                                                                            |
| 4   | Whether to implement Postgres row-level security (RLS) as defense-in-depth alongside mandatory application-layer checks          | `multi-tenancy.md` §2                          | Defer to Phase 11 (Reliability & Security Hardening) — application-layer enforcement is the required control and must be correct on its own regardless of this decision.                 |
| 5   | Whether per-membership permission overrides (beyond role defaults) are a real product requirement                                | `rbac.md` §5, `identity-data-model.md` §1      | Schema placeholder included (`membership_permission_overrides`), unpopulated; decide based on actual customer demand, not speculatively build the feature now.                           |
| 6   | MFA policy — which roles/operations require it                                                                                   | `authentication.md` §5                         | Owner/product decision; Clerk supports MFA natively whenever policy is defined.                                                                                                          |
| 7   | Exact step-up re-authentication mechanism                                                                                        | `authentication.md` §4                         | Defer exact Clerk API/flow to Phase 2 implementation-time verification (not verified in this pass).                                                                                      |
| 8   | Mechanism for the "workspace never has zero owners" invariant                                                                    | `workspace-model.md` §5                        | Recommend: block last-owner removal outright; require explicit ownership transfer as a distinct, separately-permissioned action.                                                         |
| 9   | Exact `organizationMembership.created`-equivalent event name                                                                     | `clerk-integration.md` finding #8              | Confirm against the live Clerk Dashboard Event Catalog immediately before Phase 2 webhook implementation — reconciliation (`identity-sync.md` §4) is the backstop if this is ever wrong. |
| 10  | Real-time membership-revocation propagation (vs. next-request-only revocation)                                                   | `identity-sync.md` §1, `workspace-model.md` §5 | Next-request-only is sufficient for Phase 2 given every request re-checks membership; real-time (e.g. forced session termination) is a hardening-phase enhancement, not a Phase 2 gap.   |
| 11  | Storage mechanism for the "claimed active workspace" (Clerk session claim vs. our own server-side record)                        | `workspace-model.md` §3 step 2                 | Left to Phase 2 implementation — either is acceptable provided it is never trusted without the `requireMembership()` re-check in the same flow.                                          |

## 3. Blockers Before Phase 2 Implementation Can Start

None of the above block _this document set_. They block writing Phase 2 code for the
specific area each touches — e.g., decision #1/#2 should be settled before creating a real
Clerk application; decision #9 must be checked before the webhook handler for membership
creation is written, not before the rest of Phase 2 begins.

Separately, `clerk-integration.md` finding #1 is a **concrete engineering blocker, not a
decision**: `apps/web`'s pinned Next.js version (`^15.1.4`) is below `@clerk/nextjs`'s
minimum supported peer (`^15.2.8`) as of the verification date. Bumping Next.js is a
required first step of Phase 2 implementation, not a Phase 2A architecture question.
