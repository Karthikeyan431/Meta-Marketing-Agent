# Implementation Plan

**Project:** AI Marketing Manager
**Based on:** `docs/implementation/repository-assessment.md` (Phase 0 findings), the full 172-document architecture corpus (Gates 0–11), and `docs/12-development-readiness/IMPLEMENTATION_PHASES.md`.
**Status:** Draft — for review before Phase 1 begins. This plan does not itself authorize implementation to start (see Blockers, below).

---

## Guiding Principles

Carried forward unchanged from `CLAUDE.md`, `DEVELOPMENT_PRINCIPLES.md`, and `CLAUDE_CODE_MASTER_INSTRUCTIONS.md` — restated here because every phase below must be executed under them:

- Approved documentation is the source of truth; conflicts are stopped and reported, never guessed past.
- AI is never the security boundary; deterministic application code is.
- Server-side authorization and workspace/tenant isolation are enforced at every resource boundary, from the first protected endpoint onward.
- External systems (Meta, the LLM provider) are untrusted dependencies: validate their output, verify their mutations, never trust their claims of success.
- Tests land with the code that needs them, not after.
- Each phase ends at an explicit gate; do not continue past a failing gate.
- Secrets are never committed, logged, or exposed to the browser or the AI.

---

## Blockers Before Phase 1 Can Start

These are process blockers, not technical ones, and should be resolved by the project owner rather than by Claude Code unilaterally:

1. **Gate approval status (see repository-assessment.md §9).** All 12 SDLC gates are self-marked `Draft for Approval` with 0% of checklist items checked, and the repository's own `SDLC.md` forbids feature development before gate approval. **Recommended resolution:** the project owner explicitly confirms that the current documentation set (as-is, or with named amendments) is authoritative enough to build against, functioning as a de facto approval for engineering purposes. This plan proceeds on the assumption that such confirmation will be given; it should not be read as that confirmation itself.
2. **Missing numeric guardrails.** Financial/spend limits, rate limits, SLAs, RPO/RTO, and AI confidence/cooldown thresholds are structurally required everywhere but quantified nowhere. These are product/business decisions. **Recommended resolution:** capture them in a short addendum (e.g., `docs/04-data/../LIMITS.md` or an ADR) before Phase 9 (Controlled Actions) needs them — they do not block Phases 1–8.
3. **Technology stack selection.** See `repository-assessment.md` §10. **Recommended resolution:** resolved inside Phase 1 itself (below), recorded as an ADR-style decision log, since the docs explicitly delegate this choice to implementation time.

None of these block *this document* or the completed repository-assessment — they block writing the first line of application code.

---

## Recommended Phase Sequence

The repository's own `IMPLEMENTATION_PHASES.md` (Gate 11) already defines a 14-stage sequence (Phase 0 Repository Assessment through Phase 13 Production) that is **functionally identical** to the 13-phase sequence given in the Phase 0 task prompt, offset by one (the task's "Phase 1: Repository/Foundation" = the repo doc's "Phase 1 — Foundation"; the task's "Phase 13: Production" = the repo doc's "Phase 13 — Production"). No reordering is required — the existing target sequence is architecturally sound and is adopted as-is, for the following reasons:

- **Foundation before Identity:** you cannot build authentication/RBAC without a database, migration process, logging, and CI already in place.
- **Identity before Meta Connection:** the OAuth connect flow requires an authenticated user and a workspace to attach the connection to.
- **Meta Connection before Core Meta Data:** you cannot sync campaigns/ad sets/ads before a connection and adapter exist.
- **Core Meta Data before API:** the `/api/v1` contract's read endpoints are meaningless without underlying synced data to serve.
- **API before Frontend Foundation:** the frontend's typed API client needs a real, contract-first backend to call — building UI against a nonexistent API inverts the mandated contract-first principle (`API-015`, `OPENAPI_REQUIREMENTS.md`).
- **Frontend Foundation before Campaign UX:** the design system, routing, and workspace shell are prerequisites for any feature screen.
- **Campaign UX before AI Read-Only:** the AI's grounded answers reference the same campaign/insights data the dashboards already render — building the read surface first gives the AI something real to ground against and something to test its answers against.
- **AI Read-Only before Controlled AI Actions:** per ADR-002 and the AI-001 principle "AI is not the security boundary," the deterministic policy/approval/audit machinery (already partially seeded in Phase 2/5/9) must exist and be exercised in a read-only AI context before the AI is allowed to propose mutations. This is the single most important ordering constraint in the whole plan — building mutation-capable AI before its guardrails are proven would directly violate the architecture's core safety principle.
- **Controlled Actions before Reporting:** reports surface AI interpretation and action outcomes; the action model needs to exist first.
- **Reporting before Reliability & Security Hardening:** hardening is a cross-cutting pass that benefits from a feature-complete surface to harden.
- **Hardening before Staging & UAT:** UAT should exercise a production-like, already-hardened build.
- **Staging & UAT before Production:** self-explanatory release gate.

**One adjustment relative to a literal reading of the task's phase list:** the task's Phase 11 ("Reliability & Security Hardening") is not treated as a single late pass in isolation — per `DEVELOPMENT_PRINCIPLES.md`'s rule that tests and security review land with each phase's code, security/reliability work for a given feature area (tenant isolation tests, authz negative tests, resilience tests for that phase's external calls) is done **inside** the phase that introduces it, and Phase 11 is reserved for the cross-cutting, whole-system passes that only make sense once everything exists: full rate-limit tuning, load testing, disaster-recovery restore testing, and the complete `PRODUCTION_SECURITY_CHECKLIST.md` sign-off. This matches `RELEASE_CRITERIA.md`'s per-feature vs. per-release Definition of Done split.

---

## Phase-by-Phase Detail

### Phase 1 — Repository / Foundation
**Objective:** Establish the first installable, lintable, testable, buildable state.
**Key deliverables:**
- `git init`; adopt the target repository layout from `REPOSITORY_STRUCTURE.md`, adapted once the stack is chosen.
- **Explicit technology decisions**, recorded (language/runtime, backend framework, ORM, migration tool, frontend framework, CI platform, cloud provider, IaC tool, secret manager, queue technology — resolving the Redis-vs-job-queue ambiguity noted in the assessment).
- Database provisioned (PostgreSQL, per the corroborated target); first migration executed.
- Structured logging, error-handling conventions, and correlation-ID plumbing.
- Minimal CI pipeline (lint, typecheck, unit test, secret scan, build) running on every commit.
- Secret management wired up before any credential is created.
**Gate:** baseline validation commands from `repository-assessment.md` §4 all exist and pass.

### Phase 2 — Identity & Multi-Tenancy
**Objective:** Authentication, sessions, workspace membership, RBAC, tenant isolation, audit foundation.
**Key deliverables:** users/workspaces/workspace_memberships tables; chosen auth mechanism; server-controlled sessions; authorization chain (auth→membership→permission→resource-ownership→operation→policy); the concrete RBAC permission matrix behind the placeholder role names (OWNER/ADMIN/MARKETER/ANALYST/APPROVER/VIEWER); `audit_events` table, append-only.
**Gate:** the six cross-tenant attack scenarios from `TENANT_ISOLATION.md`/`TENANT_SECURITY.md` are implemented as automated negative tests and all fail safely.

### Phase 3 — Meta Connection
**Objective:** OAuth, credential protection, account discovery, connection health, adapter and sync foundation.
**Key deliverables:** `MetaClient`/`MetaPort` adapter skeleton; OAuth connect/callback flow with unpredictable/short-lived/single-use state; encrypted credential storage; account discovery and selection UI/API; connection health states (Connected/Degraded/Reconnect required/Disconnected); disconnect flow preserving audit history.
**Gate:** OAuth CSRF/state test, credential-leakage test, and disconnect-preserves-audit test pass; Meta Graph/Marketing API version pinned and documented as a decision record.

### Phase 4 — Core Meta Data
**Objective:** Ad accounts, campaigns, ad sets, ads, normalized data model, pagination and synchronization.
**Key deliverables:** canonical entity tables per `SCHEMA_DESIGN.md`; sync workers (initial full + incremental + webhook-triggered + reconciliation); freshness tracking exposed on every synced record; webhook endpoint (`POST /webhooks/meta`) with authenticity validation and dedup.
**Gate:** repeated syncs do not duplicate entities; a simulated partial-page failure is not reported as a complete sync; freshness state is queryable.

### Phase 5 — API
**Objective:** Implement approved `/api/v1` contracts, OpenAPI, validation, authorization, idempotency and errors.
**Key deliverables:** OpenAPI spec committed to source control and CI-validated before/with implementation (`OPENAPI_REQUIREMENTS.md`); `{data,meta}`/`{error:{code,message,request_id}}` envelopes; cursor pagination with allowlisted filters/sorts; idempotency keys on financial-impacting mutation endpoints; object-level authorization on every protected endpoint.
**Gate:** automated BOLA/IDOR tests pass on every resource family; idempotency-key replay-with-different-params fails as required.

### Phase 6 — Frontend Foundation
**Objective:** Design system, routing, API client, authentication UI, workspace shell, responsive/accessibility foundation.
**Key deliverables:** chosen frontend framework scaffolded per the five-layer architecture (Pages/Routes → Feature Components → Domain UI State → API Client → Backend API); central typed API client (no direct Meta calls from the browser — enforced by construction); design tokens and the first slice of the 24-component design system; WCAG 2.2 AA baseline wired into CI.
**Gate:** login → workspace shell renders; no direct Meta API calls exist anywhere in frontend code (verified by grep/lint rule, not just review).

### Phase 7 — Campaign UX
**Objective:** Account dashboard, campaign tables, campaign detail, insights and global search.
**Key deliverables:** dashboard with freshness indicators; campaign table/detail views distinguishing source metrics from AI interpretation (a rule repeated in Gates 8 and 9); Ctrl/Cmd+K global search, workspace-scoped, never auto-navigating on an ambiguous match.
**Gate:** search cross-workspace-leakage negative test passes; freshness indicators reflect actual sync state, not a static label.

### Phase 8 — AI Read-Only
**Objective:** Chat, intent/entity resolution, retrieval tools, grounded explanations and AI evaluation suite.
**Key deliverables:** conversation/message/ai_run/ai_tool_call persistence; intent classification (14 classes); workspace-scoped entity resolution with confidence thresholds and clarification-on-ambiguity; read-only typed tools only (no mutation tools exist yet at this phase); the untrusted-external-data prompt boundary structure; the golden/adversarial/prompt-injection evaluation dataset, run as a CI regression gate.
**Gate:** prompt-injection test cases (malicious content embedded in campaign names/descriptions) cannot cause an unauthorized tool call; every factual claim in a response is traceable to a tool result.

### Phase 9 — Controlled AI Actions
**Objective:** Action model, policy engine, approval workflow, execution, verification and audit.
**Key deliverables:** the full action state machine with version/hash-bound approvals; Deterministic Action Compiler (AI proposals are never executed directly from model output); policy engine enforcing the (by-now product-supplied, see Blocker #2) numeric financial/operational limits; emergency stop; read-after-write verification with `VERIFIED`/`VERIFICATION_FAILED` states; mutation tools added to the AI tool registry only now, gated by everything built in Phases 2, 5, and this phase.
**Gate:** the "500%-budget-increase" style worked example from `SPEND_AND_FINANCIAL_CONTROLS.md` is an automated test and is rejected; approval replay and changed-parameter-after-preview are both automated negative tests and both fail correctly; a failed Meta mutation is never reported as successful.

### Phase 10 — Reporting
**Objective:** Report builder, AI reports, exports and freshness indicators.
**Key deliverables:** report builder (account/campaign selection, date range, metrics, breakdowns, comparison period); AI-generated reports separating source facts / calculated metrics / AI interpretation / recommendations; export formats; freshness surfaced on every report.
**Gate:** a report generated from intentionally stale data is visibly labeled as such, not silently presented as current.

### Phase 11 — Reliability & Security Hardening
**Objective:** Rate limits, resilience, security tests, performance, observability, backup/restore validation.
**Key deliverables:** the 8-layer rate-limiting model tuned with real numeric thresholds (from load testing, per `API_RATE_LIMITS.md`'s explicit deferral); the ten resilience failure classes simulated; the full `PRODUCTION_SECURITY_CHECKLIST.md` (SEC-016) and `INFRA_SECURITY_CHECKLIST.md` (DEVOPS-018) checked off; RPO/RTO finalized and backup-restore tested; performance budgets defined and met.
**Gate:** both production checklists 100% complete; disaster-recovery restore test passes.

### Phase 12 — Staging & UAT
**Objective:** Production-like deployment, complete E2E, manual UAT, defect remediation and release candidate.
**Key deliverables:** staging environment at production parity minus credentials/spend; the full 10-step critical E2E path and 8 negative E2E cases automated and green; manual UAT walking the same critical journey, explicitly including a prompt-injection attempt; zero open Critical defects, High defects have explicit documented risk acceptance.
**Gate:** `RELEASE_CRITERIA.md`'s Release Definition of Done fully satisfied.

### Phase 13 — Production
**Objective:** Production deployment, smoke tests, controlled mutation enablement and monitoring.
**Key deliverables:** production smoke tests (read-only health checks before any mutation is enabled, per `META_INTEGRATION_TESTING.md`); monitoring/alerting live (Critical/High/Informational tiers); rollback verified without requiring an infrastructure rebuild; production runbook exercised.
**Gate:** all of the above green, then — and only then — mutation-capable operation is enabled in production.

---

## Traceability Note

Every deliverable and gate above is sourced from the Gate 0–11 documentation extracted during this Phase 0 assessment; none introduces a new feature, framework, or business rule not already present in the approved (pending sign-off, per Blocker #1) corpus. Where the corpus leaves a decision open (technology selection, numeric thresholds), this plan says so explicitly rather than silently choosing on Claude Code's behalf, per `CLAUDE.md`'s rule against inventing requirements.

**This plan stops here.** Per the Phase 0 task instructions and `CLAUDE_PROMPT_PHASE_0.md`, no Phase 1 work begins until the blockers above are explicitly addressed and the project owner approves proceeding.
