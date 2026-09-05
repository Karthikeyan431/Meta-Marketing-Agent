# Phase 2 Implementation Sequence

**Document ID:** IDENT-015 | Version 1.0 | Status: PROPOSED | Phase: 2A (Decision Preparation)

This document is planning input for Phase 2 implementation. **No code, dependency, or
configuration change has been made as part of producing this document** — the Next.js
version bump described in §1 is a recommendation for Phase 2's first implementation step,
not something performed in this phase.

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

## 2. Proposed Phase 2 Implementation Order

Refines the governing task's suggested skeleton order based on the architecture actually
designed in Phase 2A. Each step names its concrete dependency on the step(s) before it.

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

**Explicit non-dependency note:** Postgres RLS (OD-04, deferred to Phase 11) and
per-membership permission overrides (OD-05, schema-only) have no step above — they are
intentionally absent from the Phase 2 sequence per their respective decisions.

## 3. Open Prerequisites Before Step 1 Can Start

Per §3 of `phase-2a-decisions.md` and this document's OD numbering
(`phase-2a-owner-decision-package.md`), the following owner decisions should be resolved
before their respective steps, not before Phase 2 begins entirely:

- OD-01 (Clerk plan) and OD-02 (Organization mapping) — before step 3.
- OD-06 (MFA policy) — before step 9.
- All other open decisions (OD-03, OD-05, OD-07, OD-08, OD-09, OD-10, OD-11) have a
  stated recommendation that can proceed by default at their respective step unless the
  owner overrides it.

Step 1 (Next.js bump) and step 2 (schema migration) have no open-decision dependency and
could begin as soon as Phase 2 is explicitly authorized to start — which, per this task's
Hard Restrictions, has not happened yet.
