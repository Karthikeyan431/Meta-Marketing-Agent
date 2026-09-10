# Phase 2 Implementation Sequence

**Document ID:** IDENT-015 | Version 1.9 | Status: IN PROGRESS (steps 1, 2, 3–11, 12 done; Phase 2.4A architecture finalized; Phase 2.4 RBAC & Permission Enforcement implemented, then amended; Phase 2.5 §4 steps 2–3 implemented, invite route implemented; Phase 2.6 member list implemented) | Phase: 2 (Implementation)

This document is planning input for Phase 2 implementation. **No code, dependency, or
configuration change has been made as part of producing this document** — the Next.js
version bump described in §1 is a recommendation for Phase 2's first implementation step,
not something performed in this phase.

**2026-09-05 update:** the owner's "Approve Phase 2A Identity Decisions" closure message
finalized the implementation sequence in §2 below (superseding the previously PROPOSED
12-step order) and resolved the owner-decision prerequisites named in §3.

**Phase 2.1 (2026-09-05):** step 1 (Next.js compatibility upgrade) done; step 2 (Clerk
installation/configuration) partially done — package installed, environment placeholders
declared, no real Clerk application created. See `phase-2-1-implementation-report.md`.

**Phase 2.2 (2026-09-05):** step 12 (Frontend auth/session) done — see
`phase-2-2-implementation-report.md`. **Executed out of the original step order**: the
owner's explicit Phase 2.2 task requested the Clerk authentication boundary
(middleware, sign-in/sign-up UI, one protected route, and the API-side identity
resolution seeding a future `requireAuth()`) _before_ steps 3–11 (Application User,
Workspace, Membership, Role, Permission, the full authorization primitive chain,
resource authorization, workspace-aware API protection, identity synchronization). This
is a deliberate re-sequencing by explicit instruction, not a silent deviation — nothing
about Clerk authentication depends on those steps existing first, and no step below was
skipped, only deferred. Steps 3–11 remain entirely unbuilt.

**Phase 2.2 UAT closure (2026-09-06):** a real Clerk development application was made
available and the full authentication boundary was re-verified end-to-end against it
(real sign-up, sign-in, session persistence across a server restart, sign-out, and a
real `apps/api`/Next.js identity match) — see `phase-2-2-implementation-report.md` §12.
No code change was required. This closes the "no real Clerk application" limitation
carried since Phase 2.1/2.2.

**Phase 2.5 (2026-09-10):** No such phase exists in the governing SDLC corpus
(`IMPLEMENTATION_PHASES.md` goes directly from Phase 2 to Phase 3 — see
`phase-2-5-implementation-report.md` §1). Owner-confirmed scope: execute §4's remaining
steps 2–3 (member-management API routes, ownership-transfer route), deferred during actual
Phase 2.4 execution ("do not add broad CRUD"). Implemented `PATCH`/`DELETE
/workspaces/:id/members/:membershipId` and `POST /workspaces/:id/ownership-transfer` as thin
wrappers around the existing `changeMembershipRole()`/`removeMembership()`/
`transferOwnership()` domain functions — no authorization logic duplicated. 19 new
integration tests close all 9 `REQUIRED (Phase 2.4)` test-matrix items at the route level.
`POST .../members/invite` remained unimplemented pending an owner decision about the
invitation mechanism (Clerk Organization Invitation API vs. an alternative); see
`phase-2-5-implementation-report.md` §3/§13.

**Phase 2.5 addendum (2026-09-10, same day):** owner selected Clerk's Organization
Invitation API. Implemented `POST /workspaces/:id/members/invite` — request body is
`{ emailAddress }` only, no role field; creates **no** local `workspace_membership` row.
The invited person's application role question was resolved without inventing a new
mechanism: `upsertMembershipFromSync()` already defaults every newly-synced membership to
VIEWER regardless of how it was created (Phase 2.3, unchanged), so the invitation carries no
role and promotion happens via the already-implemented role-change route after acceptance.
Clerk's mandatory `role` parameter is fixed to `org:member` (non-authoritative, per
`clerk-integration.md`'s existing finding that Clerk org roles are unused for this
project's authorization) — never mapped from our RBAC. 11 new integration tests. See
`phase-2-5-implementation-report.md` §14.

**Phase 2.6 (2026-09-10, same day):** no such phase exists in the governing SDLC corpus
either (same gap as Phase 2.5 — `IMPLEMENTATION_PHASES.md` goes directly from Phase 2 to
Phase 3). Owner-confirmed scope, chosen from two candidates surfaced before any change:
`GET /workspaces/:id/members` (list) — the one fully-specified, zero-ambiguity remaining
gap in the member-management surface (`identity-api-contracts.md` §2, `members.read`
already granted to every role). Implemented as a thin wrapper around the existing
`listActiveMembershipsForWorkspace()`. Full workspace CRUD (`GET`/`PATCH`/`DELETE
/workspaces/:id`) was the other candidate but was not selected — `DELETE`'s mechanism
remains an open owner decision (does workspace deletion also deactivate the Clerk
Organization?), untouched by this phase. 8 new integration tests. See
`phase-2-6-implementation-report.md`.

**Phase 2.4 amendment (2026-09-10, same day):** owner issued superseding decisions for
OD-2.4A-01 (system actor identity: DEFERRED → APPROVED) and OD-2.4A-03 (`campaign.pause`
worker-invocability: NO EXCEPTION → APPROVED under guardrails), reversing the two decisions
Phase 2.4 had just shipped against. Both amendments were policy/contract ratifications, not
new execution paths — no autonomous-optimization pipeline or campaign domain exists yet to
attach them to. Added `SystemActorContext`/`assertSystemActorProvisioned()`
(`packages/domain/src/identity/system-actor.ts`) as the now-settled, owner-approved contract
for whichever future phase builds a system-triggered mutation job; updated
`worker-authorization-contract.md` §6 and `permission-catalog.md`'s `campaign.pause` row to
record the ratified policy. OD-2.4A-02 and OD-2.4A-04 were unchanged. See
`phase-2-4-implementation-report.md`'s addendum and `phase-2-4a-decisions.md`'s amendment
block for full detail.

**Phase 2.4 (2026-09-10):** RBAC & Permission Enforcement implemented — see
`phase-2-4-implementation-report.md`. Closed the OWNER-assignment gap in
`changeMembershipRole()` and a second, previously-unidentified gap in `transferOwnership()`
(never verified the acting user was the outgoing owner); added actor-authority enforcement,
self-escalation prevention, and denial-audit logging to the domain-layer mutation
functions; corrected `rbac.md` §8.2's rule 1 (co-ownership must remain reachable, per
ADR-020 — an unconditional OWNER-assignment ban was a Phase 2.4A drafting error). Also
fixed a genuine concurrency bug in `provisionUser()` found via a flaky test. 135 tests
(56 unit + 79 integration), real Clerk UAT. **No new API routes, no migration, no new
role/permission** — architecture-conforming implementation only, per that task's Hard
Restrictions.

**Phase 2.4A (2026-09-10):** RBAC & Permission Enforcement architecture finalized —
`rbac.md` (role hierarchy model, role mutation/self-escalation rules),
`permission-catalog.md` (new), `authorization.md` (permission resolution mechanics),
`ai-authorization-contract.md` (new), `worker-authorization-contract.md` (new),
`identity-threat-model.md` (threats #16–#23), `phase-2-4a-test-matrix.md` (new),
`phase-2-4a-decisions.md` (new, 4 owner decisions recorded, none blocking), ADR-025–ADR-028.
**No code was written or changed** — architecture-only per that task's Hard Restrictions.
See `phase-2-4a-gate-checklist.md` for the full closure record. §4 below is the resulting
Phase 2.4 implementation sequence.

**Phase 2.3 (2026-09-10):** steps 3–11 (Application User, Workspace, Workspace
Membership, Role model, Permission model, Authorization primitives, Resource-level
authorization, workspace-aware API protection, and identity synchronization between
Clerk and the application) are now done — see `phase-2-3-implementation-report.md`. Workspace
switching (step 13) is also implemented (`POST /workspaces/:id/switch`), ahead of its
originally-sequenced position, since it required no additional foundation beyond steps
3–11. Tenant-isolation and security regression tests (steps 14–15) were executed
alongside steps 8–11 rather than deferred to the end, consistent with this project's
established incremental-verification pattern. Real Clerk UAT (step 16) closed
2026-09-10 against a live Clerk development instance with Organizations enabled — see
`phase-2-3-implementation-report.md` §15.

## 1. Next.js Upgrade Recommendation

### 1.1 The blocker

`clerk-integration.md` finding #1 (re-confirmed here, not re-verified live in this pass):
`apps/web`'s pinned Next.js version (`^15.1.4`) is below `@clerk/nextjs`'s minimum
supported peer range. Clerk cannot be installed until this is resolved. This is an
engineering blocker, not an owner decision — recorded in `phase-2a-decisions.md` §3.

### 1.2 Live verification performed this pass

- Confirmed via the npm registry that `next@15.5.9` is a real, currently published
  version, with peer dependency range `react: ^18.2.0 || ^19.0.0` / `react-dom` matching
  — compatible with this project's existing `react@^19.0.0` pin. No React version change
  is required alongside the Next.js bump.
- Confirmed the npm `latest` dist-tag for `next` is currently `16.3.4` — Next.js 16 is
  already released and is **not** the target here; the task's Hard Restrictions and this
  recommendation both stay within the v15 major line.
- Reviewed the Next.js changelog/release notes between `15.1.4` (current pin) and
  `15.5.9`: no breaking changes were found beyond what Next.js 15.0 already introduced
  (which this project's `^15.1.4` pin already carries). The changes across `15.2.x`
  through `15.5.x` are additive: Turbopack production builds (beta in 15.5), stable
  Node.js middleware, TypeScript configuration improvements, and a deprecation warning
  for the legacy `next lint` command (removal, not present in 15.x — safe to ignore for
  now, relevant only if `next lint` is in current use, which it is not — this project's
  Phase 1 Foundation CI uses ESLint directly, not `next lint`).

### 1.3 Recommendation

**Target `next@^15.5.9`** for the Phase 2 implementation-time upgrade:

- It is the highest 15.x version explicitly within the range `@clerk/nextjs` supports,
  giving the most bug fixes/features available before a future, separately-decided v16
  migration.
- It stays within the v15 major, honoring this task's explicit "no Next.js major-version
  upgrade" restriction and the prior task's equivalent restriction.
- No React version change is required alongside it.

### 1.4 What Phase 2 must still do at implementation time (not performed here)

1. Re-verify `@clerk/nextjs`'s current minimum supported peer range immediately before
   installing (peer ranges can change between now and Phase 2's start).
2. Bump `apps/web`'s `next`/`eslint-config-next` (if present) versions, run the full
   existing test/build/typecheck suite, and confirm no regression, **before** installing
   `@clerk/nextjs` itself — isolating the two changes makes any failure attributable to
   one cause at a time.
3. Only then proceed to Clerk installation and the `middleware.ts` (Next.js ≤15 API — not
   `proxy.ts`, which is a v16-only concept per `clerk-integration.md`) integration pattern
   already designed in `clerk-integration.md`/`identity-architecture.md`.

## 2. Finalized Phase 2 Implementation Order (owner-accepted 2026-09-05)

This supersedes the previously PROPOSED 12-step order below with the sequence the owner's
closure message finalized. Each step's dependency on the step(s) before it is noted;
`phase-2a-owner-decision-package.md`'s OD references show which decisions each step relies
on (all now ACCEPTED/DEFERRED, none blocking).

1. **Next.js compatibility upgrade** (§1) — no dependents can start without this; pure
   dependency/build-config work, touches no identity logic. Target: `next@^15.5.9`.
   **DONE (Phase 2.1, see `phase-2-1-implementation-report.md`)** — declared specifier
   updated to `^15.5.9`; the resolved binary (`15.5.25`) was unchanged, since it already
   satisfied the wider prior range.
2. **Clerk installation/configuration** — depends on step 1. Plan (OD-01: Pro tier or
   higher) and Organization mapping (OD-02: Option A) are both ACCEPTED, so this step is
   unblocked by owner decision; webhook signing secret issuance and environment variables
   follow `SECURITY_BOUNDARY.md`'s existing secret-handling rules.
   **PARTIALLY DONE (Phase 2.1)** — `@clerk/nextjs@^7.9.1` installed and environment
   variable placeholders declared in `.env.example`; **not done**: no real Clerk
   application/credentials exist yet (Dashboard setup, an out-of-repository action, remains
   a Phase 2.2 prerequisite — `phase-2-1-implementation-report.md` §10).
3. **Application User** — the `users` table (`identity-data-model.md` §2), keyed by
   `clerk_user_id` — depends on step 2 existing to have a Clerk identity to key against.
   **DONE (Phase 2.3)** — `packages/domain/src/identity/users.ts`'s `provisionUser()`,
   called from `apps/api`'s `requireAuth()` on first contact; idempotent, race-safe (final
   protection is the `clerk_user_id` unique constraint).
4. **Workspace** — the `workspaces` table, including the `clerk_org_id` reference column
   per OD-02's Option A — depends on step 2.
   **DONE (Phase 2.3)** — `createWorkspaceWithOwner()`; the only code path that creates a
   Workspace row, invoked exclusively from sync (webhook/reconciliation), never from a
   request-time path — see `phase-2-3-implementation-report.md` §6.
5. **Workspace Membership** — the `workspace_memberships` join table — depends on steps 3
   and 4.
   **DONE (Phase 2.3)** — `upsertMembershipFromSync()`/`removeMembership()`/
   `changeMembershipRole()`/`transferOwnership()`.
6. **Role model** — the `role` enum on `Membership` (`rbac.md` §1/§3, OD-03 resolved:
   `OWNER/ADMIN/MANAGER/ANALYST/VIEWER`, no separate `APPROVER`) — depends on step 5.
   **DONE (Phase 2.3)** — `Role` Postgres enum, seeded via `prisma/seed.ts`.
7. **Permission model** — `permissions`/`role_permissions` tables and the
   `membership_permission_overrides` placeholder (unpopulated per OD-05) —
   depends on step 6.
   **DONE (Phase 2.3)** — full rbac.md §3 matrix (27 permissions × role grants) seeded and
   drift-tested against `packages/domain/src/rbac-catalog.ts`; the override table remains
   an unpopulated placeholder, exactly as designed.
8. **Authorization primitives** — `requireAuth()/requireWorkspace()/requireMembership()/
requirePermission()/requireResourceAccess()` (`authorization.md` §1, owner-accepted
   Authorization Contract) — depends on steps 3–7 existing to have real data to check
   against.
   **DONE (Phase 2.3)** — `apps/api/src/plugins/authorization.ts`.
9. **Resource-level authorization** — the `WHERE id AND workspace_id` mechanical rule
   (`authorization.md` §2) applied to whichever resources exist at this point — depends
   on step 8; this is the primitive every future resource (campaigns, reports, etc., built
   in later phases) will call.
   **DONE (Phase 2.3)** — `requireResourceAccess()` implemented generically; no
   resource-specific (Meta) authorization added, per the Hard Restrictions.
10. **Workspace-aware API protection** — wiring steps 8–9 into actual route handlers
    (`identity-api-contracts.md`) — depends on step 9.
    **DONE (Phase 2.3)** — `GET /me`, `GET /workspaces`, `POST /workspaces/:id/switch`.
11. **Clerk/application identity synchronization** — webhook handlers + reconciliation job
    (`identity-sync.md`), reconciliation baseline ACCEPTED at every 30 minutes,
    configurable (OD-09) — depends on steps 3–5 existing to sync _into_; the exact
    membership-created event name (OD-09's other sub-item) is confirmed against the live
    Dashboard immediately before this step's membership-creation handler specifically.
    **DONE (Phase 2.3)** — `POST /webhooks/clerk` + `workers/webhook`'s processor and
    `reconcileIdentity()`; `organizationMembership.created` confirmed as the real event
    name via `@clerk/backend@3.17.1`'s own shipped types (finding #8 closed).
12. **Frontend auth/session** — `<ClerkProvider>`, sign-in/sign-up UI — depends on step 2.
    **DONE (Phase 2.2, see `phase-2-2-implementation-report.md`)** — `middleware.ts`
    (`clerkMiddleware()`), `<ClerkProvider>` + `<Show>`-based sign-in/up/out controls in
    the root layout, `/sign-in` and `/sign-up` catch-all pages, one protected route
    (`/app`), and the seed of a future `requireAuth()` on both the Next.js side
    (`getAuthenticatedIdentity()`) and the separate Fastify API side
    (`requireAuthenticatedIdentity()`, `GET /me`). Executed ahead of steps 3–11 by
    explicit instruction — see the note above.
13. **Workspace switching** — the switching flow (`workspace-model.md` §4), including the
    owner-accepted active-workspace resolution chain (`Clerk user → Clerk org context →
application membership → workspace status → authorized workspace`, OD-11) — depends
    on steps 8–10, 12.
    **DONE (Phase 2.3)** — `POST /workspaces/:id/switch`; the org-context/sole-membership
    resolution chain lives in `resolveActiveWorkspace()`, used by both `GET /me` and the
    switch endpoint.
14. **Tenant-isolation tests** — the negative-test catalog (`multi-tenancy.md` §4,
    `identity-threat-model.md`) — depends on steps 8–11 existing to test against.
    **DONE (Phase 2.3)** — see `phase-2-3-implementation-report.md` §13.
15. **Security regression tests** — MFA policy (OD-06: required for OWNER/ADMIN and
    high-risk financial approval), step-up enforcement, worker authorization context
    (owner-accepted field set: `workspaceId`, `initiatingUserId`/actor, resource scope,
    action scope, `correlationId`, `jobId`), AI-authorization independence — depends on
    steps 8–14.
    **PARTIALLY DONE (Phase 2.3)** — worker authorization context field set is carried by
    every sync/reconciliation write (`correlationId`, actor, workspace, action all present
    on every `AuditEvent` row). **Not done, explicitly out of Phase 2.3 scope**: MFA/
    step-up enforcement (OD-06/OD-07) — no financial-approval flow exists yet for it to
    gate (Phase 9 scope); AI-authorization independence has no AI tool calls yet to test
    against (Phase 2.3 Hard Restrictions exclude AI). See known limitations,
    `phase-2-3-implementation-report.md` §19.
16. **Manual UAT** — depends on all preceding steps landing and passing their own tests.
    **DONE (Phase 2.3, 2026-09-10)** — real Clerk development instance, Organizations
    enabled; see `phase-2-3-implementation-report.md` §15.

**Explicit non-dependency note:** Postgres RLS (OD-04, deferred to Phase 11) and building
out per-membership permission overrides beyond the schema placeholder (OD-05) have no step
above — they are intentionally absent from the Phase 2 sequence per their respective
decisions.

## 4. Phase 2.4 Implementation Sequence (planning input — produced by Phase 2.4A, not yet authorized to execute)

Fully specified by Phase 2.4A's architecture documents; no further design discussion should
be required to execute these steps once Phase 2.4 is explicitly authorized.

1. **Close the `changeMembershipRole()` OWNER-assignment gap** — reject `newRole ===
"OWNER"` unconditionally (`rbac.md` §8.2). This is a correctness fix to existing Phase
   2.3 code, not new functionality — sequenced first because every subsequent step
   (member-management routes) depends on the underlying function being safe to expose.
2. **Implement member-management API routes**: `POST /workspaces/:id/members/invite`,
   `PATCH /workspaces/:id/members/:membershipId` (role change), `DELETE
/workspaces/:id/members/:membershipId` (removal) — each enforcing the full chain
   `requireAuth() → requireWorkspaceMembership() → requirePermission(members.invite/
update/remove) → rbac.md §8.2's role-comparison and self-mutation checks →
requireResourceAccess() on the target membership` — depends on step 1.
3. **Implement `POST /workspaces/:id/ownership-transfer`** wrapping `transferOwnership()`
   with the same authorization chain — depends on step 1.
4. **Write the 9 `REQUIRED (Phase 2.4)` tests** from `phase-2-4a-test-matrix.md` (W4, E1–E4,
   C2, C3, F5, plus the E5-adjacent full spoof-coverage extension) — depends on steps 2–3
   existing to test against for the route-level cases; the domain-layer cases (E1, E2, C2)
   can be written against step 1 directly, ahead of the routes.
5. **Extend `AuditEvent` coverage** for the two new route categories (member-management,
   ownership-transfer-via-API) — the underlying domain functions already write audit events
   (Phase 2.3); this step is route-level verification that the existing audit calls are
   reached correctly through the new HTTP surface, not new audit-logging code.
6. **Regression**: full existing Phase 2.3 test suite (117 tests) must remain green
   throughout steps 1–5.

**Explicitly out of scope for Phase 2.4** (per Phase 2.4A's Hard Restrictions and this
sequence's own scope): AI tool implementation, worker job-signing changes, autonomous
optimization, Meta integration, financial execution, PostgreSQL RLS, membership permission
overrides — all remain exactly as deferred in §3 above and in
`phase-2-4a-decisions.md`.

<details>
<summary>Previously PROPOSED 12-step order (superseded 2026-09-05 — kept for traceability, not for use)</summary>

1. **Next.js version bump** (§1) — no dependents can start without this; it is pure
   dependency/build-config work, touches no identity logic.
2. **Database schema migration** for the identity/workspace model
   (`identity-data-model.md`): `users`, `workspaces`, `workspace_memberships`, `roles`/
   permission-mapping tables, `membership_permission_overrides` (placeholder, unpopulated
   per OD-05), audit-log tables. Must land before any code that reads/writes these tables.
3. **Clerk application setup** (OD-01's plan choice, OD-02's Organization-mapping choice
   must be owner-decided before this step, since they determine what gets configured in
   the Clerk Dashboard) — webhook signing secret issuance, environment variables per
   `SECURITY_BOUNDARY.md`'s existing secret-handling rules.
4. **Authentication integration**: `clerkMiddleware()`, `requireAuth()` primitive
   (`authorization.md` §1), session handling (`authentication.md`) — the foundation every
   other authorization primitive builds on.
5. **Workspace resolution and switching** (`workspace-model.md` §3/§4):
   `requireWorkspace()`, active-workspace resolution — depends on step 2's schema and
   step 4's authenticated identity.
6. **Membership and role enforcement**: `requireMembership()`, `requirePermission()`
   (`authorization.md` §1, `rbac.md` §3) — depends on steps 2, 4, 5.
7. **Resource authorization**: `requireResourceAccess()`, the `WHERE id AND workspace_id`
   mechanical rule (`authorization.md` §2, `multi-tenancy.md`) — depends on step 6; this
   is the primitive every future resource (campaigns, reports, etc., built in later
   phases) will call.
8. **Identity synchronization**: webhook handlers + reconciliation job
   (`identity-sync.md`) — depends on steps 2–6 existing to sync _into_; OD-09's exact
   event name confirmed against the live Dashboard immediately before this step's
   membership-creation handler specifically.
9. **MFA/step-up enforcement** (OD-06/OD-07) — depends on step 4's authentication
   integration; sequenced after the core chain (steps 4–7) because it is a policy layer
   on top of already-working authentication, not a prerequisite for it.
10. **"Never zero owners" invariant + workspace-switching edge cases** (OD-08,
    `workspace-model.md` §5) — depends on steps 5–6; naturally lands alongside or just
    after membership-management endpoints are built (`identity-api-contracts.md`).
11. **Audit logging wiring** for identity/authorization events — depends on steps 4–8
    existing to have events to log; can proceed in parallel with steps 9–10 rather than
    strictly after them.
12. **Negative-test catalog execution** (`multi-tenancy.md` §4, `identity-threat-model.md`)
    — run continuously as each of steps 4–11 lands, not deferred to the end; the
    governing SDLC pattern for this project has been to verify incrementally rather than
    in one final pass.

</details>

## 3. Owner-Decision Prerequisites — Resolved 2026-09-05

Per §3 of `phase-2a-decisions.md` and this document's OD numbering
(`phase-2a-owner-decision-package.md`), the following owner decisions gated their
respective steps above. **All are now resolved** (ACCEPTED or DEFERRED — see
`phase-2a-owner-decision-package.md` §1/§3 for the full record):

- OD-01 (Clerk plan: ACCEPTED — Pro tier or higher) and OD-02 (Organization mapping:
  ACCEPTED — Option A) — previously gated step 2 (now step 2, Clerk installation), no
  longer blocked.
- OD-06 (MFA policy: ACCEPTED — risk-tiered) — previously gated the MFA step, no longer
  blocked; implemented as part of step 15 (Security regression tests) alongside step 8's
  authorization primitives.
- All other decisions (OD-03, OD-04, OD-05, OD-07, OD-08, OD-09, OD-10, OD-11) are resolved
  per the owner decision package — either ACCEPTED/DEFERRED as recorded, or (OD-07, OD-09's
  event-name sub-item, OD-10) confirmed to need no owner decision, so the stated
  recommendation applies by default.

**No open-decision dependency remains for any step in §2.** The only remaining blocker to
starting step 1 is explicit Phase 2 implementation authorization itself — which, per the
governing closure task's Hard Restrictions, has not been given yet.
