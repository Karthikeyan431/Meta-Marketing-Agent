# Phase 2.4 Implementation Report — RBAC & Permission Enforcement

**Document ID:** IDENT-023 | Version 1.0 | Status: Complete | Phase: 2.4 (Implementation)

## 1. Baseline

Entering Phase 2.4: HEAD `a9236edc24773b90bf6bb3f9f5cc10ae785fc59b` (Phase 2.4A architecture
finalization, docs-only). Phase 2.3's identity/workspace foundation (117 tests, real-Clerk
UAT-closed) was the last code commit. Phase 2.4A's documents (`rbac.md`, `authorization.md`,
`permission-catalog.md`, `ai-authorization-contract.md`, `worker-authorization-contract.md`,
`identity-threat-model.md`, `phase-2-4a-test-matrix.md`, `phase-2-4a-decisions.md`,
`phase-2-4a-gate-checklist.md`, ADR-025–028) were used as the source of truth for this
phase's implementation, per the governing task's explicit instruction.

## 2. Architecture Gap Assessment

Inspection confirmed the primitive chain, permission catalog, and audit system exactly
matched the Phase 2.4A documents — with two implementation-time findings, both closed:

1. **The already-known OWNER-assignment gap** (`rbac.md` §8.2, ADR-028): `changeMembershipRole()`
   accepted `newRole: "OWNER"` with no special-casing.
2. **A second, previously-unidentified gap**, found during this review, not by Phase 2.4A:
   `transferOwnership()` never verified the acting user was actually the outgoing owner —
   any caller naming a real owner's `fromMembershipId` could transfer that owner's role away
   regardless of who was acting. Phase 2.4A's `rbac.md` §8.2 rule 4 had incorrectly asserted
   this was "already implicitly true."
3. **A design correction to Phase 2.4A's own rule 1**: implementing an _unconditional_ ban
   on `newRole === "OWNER"` (as Phase 2.4A literally specified) would have made co-ownership
   entirely unreachable through any code path — contradicting the older, already-approved
   `workspace-model.md` §5 / ADR-020, which treats "another active owner" as a legitimate
   alternative to `transferOwnership()` when removing an owner (a state only reachable if a
   workspace can have 2+ owners). Resolved in favor of the older, more foundational
   decision — see §3 below. `rbac.md` §8.2 was corrected to match (version 1.4).
4. **A real, race-condition bug found via a flaky test, not inspection**: `provisionUser()`'s
   original create-then-catch-unique-violation-then-refetch pattern broke Postgres
   transactions when called nested inside a caller's own `$transaction()` (exactly what
   `createWorkspaceWithOwner()` does) — see §6.

Per the governing task's rule ("do not modify architecture decisions unless a genuine
contradiction is found"), items 2–4 are documented transparently here and in `rbac.md`
itself, not silently fixed.

## 3. Owner-Assignment Fix (mandatory, Step 2)

`packages/domain/src/identity/memberships.ts`. Three new domain error classes
(`InsufficientRoleAuthorityError`, `SelfRoleMutationError`, `OwnerAssignmentNotAllowedError`
— `identity/errors.ts`) and a shared `requireRoleMutationAuthority()` helper that re-fetches
the acting user's **current** membership fresh, inside the mutation's own transaction —
never trusting a prior API-layer check.

**Implemented rule** (`changeMembershipRole()`):

1. Actor must hold an ACTIVE membership with role OWNER or ADMIN in the workspace.
2. No membership may change its own role, unconditionally, regardless of role or requested
   role.
3. `newRole === "OWNER"` requires the _actor's_ role to itself be OWNER — an ADMIN can never
   grant OWNER to anyone, including another ADMIN. An OWNER granting OWNER to a different
   member is a legitimate co-ownership grant (invariant-safe by construction — adding an
   owner can never cause zero owners).

**Implemented rule** (`transferOwnership()`): `actorUserId` must equal the outgoing (`from`)
membership's own `userId` — an OWNER may only transfer away their own ownership.

**Implemented rule** (`removeMembership()`): a member may always remove themselves
("leave"), any role; removing someone else requires OWNER/ADMIN authority, freshly checked.

Regression tests (`tests/integration/identity-owner-invariant.test.ts`, 11 new tests):
ADMIN cannot promote a member directly to OWNER; ADMIN cannot promote themselves to OWNER;
MANAGER cannot change any role; a user with no membership cannot change any role; OWNER
granting OWNER to a different member succeeds; a member can always remove themselves; MANAGER
cannot remove someone else; ADMIN can remove someone else; a non-owner cannot orchestrate a
transfer of someone else's ownership; an OWNER cannot orchestrate a transfer between two
_other_ members' memberships; self role-elevation is blocked. Owner invariant tests
(pre-existing, adjusted) continue to pass.

## 4. RBAC Implementation (role/permission resolution, Step 3)

No change — verified, not re-implemented. `PERMISSION_CATALOG`
(`packages/domain/src/rbac-catalog.ts`) remains a flat, explicit, per-permission role list
(no inheritance computation anywhere in the codebase); `roleHasPermission()` is a direct
set-membership lookup. `rbac-seed.test.ts` continues to confirm zero drift between the
in-code catalog, the seeded database, and `rbac.md`'s table (27/27 keys, byte-identical).

## 5. Permission Enforcement (`requirePermission()`, Step 4)

No change — verified, not re-implemented. `apps/api/src/plugins/authorization.ts`'s
`requirePermission()` already satisfied every requirement: authenticated identity →
active workspace → membership → role → permission, fails closed on any unresolved input
(`roleHasPermission()` returns `false`, never throws or defaults to allow), and throws a
deterministic `AuthorizationError` (403). No caching anywhere in the chain
(`authorization.md` §8, unchanged).

## 6. Resource Authorization (`requireResourceAccess()`, Step 5)

No change to the primitive itself — verified generic and correct. Added tests
(`apps/api/src/plugins/authorization.test.ts`): a mismatched resource/workspace pair (the
general form of the cross-tenant case) 404s; a resource's own lifecycle/status (e.g. a
`REMOVED` membership) is explicitly _not_ checked by this primitive — documented as a
deliberate boundary (status checks are a separate, caller-side concern, exactly how
`requireWorkspaceMembership()` separately checks `Workspace.status`).

**Unrelated but load-bearing fix found in this area**: `provisionUser()`
(`packages/domain/src/identity/users.ts`) had a genuine concurrency bug — its original
create-then-catch-unique-violation-then-refetch pattern is safe standalone but **not** safe
when called with a `Prisma.TransactionClient` nested inside a caller's own transaction
(`createWorkspaceWithOwner()` does exactly this): Postgres aborts the entire transaction on
the first statement error, so the "refetch after catching" query itself failed (`25P02`).
Found via a real, intermittently-failing concurrency test
(`identity-workspace-membership.test.ts`'s "concurrent organization-creation events"), not
inspection. Fixed with a raw `INSERT ... ON CONFLICT (clerk_user_id) DO NOTHING` (a single
statement Postgres itself guarantees never raises a client-visible error) followed by a
typed fetch — verified stable across 9 repeated full integration-suite runs after the fix
(previously failed roughly 1 in 3 runs).

## 7. API Authorization (Step 6)

Reviewed `GET /me`, `GET /workspaces`, `POST /workspaces/:id/switch`,
`POST /webhooks/clerk` — all already use the correct primitive chain and 401/403/404/409
semantics (Phase 2.3, unchanged). Added the one previously-flagged-but-missing test:
a suspended workspace is inaccessible even to an actual member (`api-workspaces.test.ts`,
"[W4]"). **No new API routes were added** — per the governing task's explicit "do not add
broad CRUD," role-mutation enforcement lives entirely at the domain layer (§3), tested there
directly against a real database, exactly matching Phase 2.3's existing `changeMembershipRole()`
/`removeMembership()`/`transferOwnership()` precedent (none of which have ever had routes).

## 8. Role Management Controls (Step 7)

See §3 — implemented as domain-layer enforcement (`requireRoleMutationAuthority()` +
the three new checks), not as new API routes, consistent with Step 6's restriction.

## 9. Audit (Step 8)

**New**: authorization _denials_ are now audited, not just successful mutations. A
`withDenialAudit()` wrapper (`memberships.ts`) writes a `FAILURE`-outcome `AuditEvent` — in
a **separate**, non-transactional write, since the mutation's own transaction has already
rolled back by the time a denial is known — for `InsufficientRoleAuthorityError`,
`SelfRoleMutationError`, `OwnerAssignmentNotAllowedError`, and `OwnerInvariantError` raised
by `changeMembershipRole()`, `removeMembership()`, and `transferOwnership()`. New event
types: `membership.role_change_denied`, `membership.removal_denied`,
`workspace.ownership_transfer_denied`. `MembershipNotFoundError` is deliberately not
audited as a denial (a resource-not-found outcome, not an authorization decision).

4 new tests verify denial events are actually written with the correct `outcome: "FAILURE"`,
`actorId`, and `correlationId`, and that a _successful_ mutation never also writes a denial
event. No second audit architecture was created — the existing `AuditEvent` table/schema
(Phase 2.3) is reused as-is.

## 10. AI Authorization Boundary (Step 9)

Verified, not implemented (Hard Restrictions exclude AI tools). The existing primitive
chain — `requireAuth()` → `requireActiveWorkspace()`/`requireWorkspaceMembership()` →
`requirePermission()` → `requireResourceAccess()` — is exactly what
`ai-authorization-contract.md` §3 specifies as the mandatory pre-execution sequence for a
future AI tool call; nothing about this phase's changes altered that chain's shape. The
self-escalation/role-mutation-authority rules added in §3 apply identically regardless of
whether the caller is a human or (in a future phase) an AI-initiated request acting on a
human's behalf — `requireRoleMutationAuthority()` has no special case for "AI-initiated,"
consistent with "AI is never the security boundary."

## 11. Worker Authorization Boundary (Step 10)

Verified, not implemented (Hard Restrictions exclude new autonomous workers). The one real
worker with job processors (`workers/webhook`, Clerk identity sync) carries `workspaceId`
implicitly per sync operation and `correlationId`/`jobId` per `worker-authorization-contract.md`
§2's field set; it re-derives state from Clerk's own current data on every reconciliation
pass rather than trusting stale enqueue-time assumptions (the same principle §3's
execution-time-re-verification rule generalizes). The conceptual scenarios the governing
task lists (actor removed, role changed, permission revoked, workspace deleted, retry after
revocation) do not yet have a concrete worker to test against — no job type carries a
human actor's authorization context yet, since no mutation-triggering worker exists (only
identity sync, which is Clerk-driven, not user-permission-driven). This remains correctly
deferred, per `worker-authorization-contract.md` §6's already-recorded open item, until a
future phase builds such a worker. No job payload signing was added, per `OD-2.4A-02`.

## 12. Security Tests (Step 12)

All required categories from the governing task's list are covered by real, passing tests
(not merely documented) — see §3's list plus the pre-existing Phase 2.3 catalog
(IDOR/BOLA, cross-workspace access, client ID/workspace spoofing, duplicate-provisioning
race, webhook replay/forgery, owner-invariant bypass under concurrency — all still green).
New this phase: self role elevation, ADMIN→OWNER attempt, MANAGER→ADMIN attempt (lacks
authority entirely), forged workspace ID via a suspended workspace (W4), the
`transferOwnership()` actor-identity gap specifically.

## 13. Concurrency Tests (Step 13)

Real concurrent operations against real PostgreSQL (not mocked), per the governing task's
explicit requirement:

- 2 simultaneous ownership-removal operations (pre-existing, Phase 2.3, still passing).
- Concurrent transfer-vs-removal targeting the same owner (pre-existing, still passing).
- **New this phase (found via failure, not by design)**: concurrent `provisionUser()` calls
  nested inside concurrent `createWorkspaceWithOwner()` transactions — the fix in §6 was
  verified by deliberately re-running the previously-flaky test 9 times in a row post-fix
  with zero failures (previously failed roughly 1 in 3 runs pre-fix).

## 14. Manual UAT (Step 14)

Performed against the same real Clerk **development** application used for Phases 2.2/2.3
— no fixture/mock keys, no CI involvement. `apps/api`/`apps/web` were already running
locally with real credentials; `tsx watch` auto-reloaded on every domain-layer code change
made in this phase, confirmed via the API's own startup log.

**What was verified, with real, unmocked round-trips:**

1. The existing real signed-in session (`user_3Iv5iZ88LnCadVBjgzp5uEQfCdF`) remained valid
   and `GET /me`/`GET /workspaces` continued to resolve correctly after every Phase 2.4 code
   change — a direct regression check on the code this phase actually modified
   (`provisionUser`, `changeMembershipRole`, `removeMembership`, `transferOwnership`).
2. A **second real Clerk Organization** was created via the Backend API (same pattern as
   Phase 2.3's UAT) and pulled in by a real `reconcileIdentity()` run
   (`usersScanned: 1, organizationsScanned: 2, workspacesCreated: 1, workspacesUpdated: 1,
membershipsUpserted: 2, discrepancies: 0`) — confirming `createWorkspaceWithOwner()`'s
   Phase 2.4-unchanged behavior still works end-to-end against real Clerk data.
3. **Two real workspaces, one real user**: `GET /workspaces` correctly listed both, each
   with the correct role.
4. **A real JWT's actual claim shape was inspected directly** — confirming the session
   carries the versioned `o.id` claim (not the classic `org_id`), live evidence that
   `extractOrgId()`'s defensive dual-shape handling (`apps/api/src/plugins/auth.ts`,
   written in Phase 2.3) is exercised by this real Clerk instance, not just a hypothetical.
5. **`POST /workspaces/:id/switch`**: succeeded (200) for the real second workspace the
   user is a genuine member of; failed (403, `AUTHORIZATION_ERROR`) for a fabricated
   workspace ID — both via real HTTP calls with the real session token.
6. **Role differentiation, using the real database and real domain functions end-to-end**:
   since self-mutation is now blocked (§3) and the real human user was the sole owner of
   the second real workspace, a synthetic **database-only** actor (never an interactive
   Clerk login — created exactly the way automated tests create fixtures, per the operating
   constraint against performing account creation myself) was used to: (a) receive
   ownership via a real `transferOwnership()` call (demoting the real human to ADMIN), then
   (b) demote the real human through MANAGER → ANALYST → VIEWER via real `changeMembershipRole()`
   calls. **After each step, a real `GET /workspaces` HTTP call with the real Clerk session
   confirmed the role change reflected immediately** (no caching) — e.g., the real,
   unmocked HTTP response showed `"role": "VIEWER"` for that workspace after the final
   demotion. The real human user was then restored to OWNER (also via real
   `transferOwnership()`), confirmed again via a real HTTP call, and the synthetic actor
   was removed entirely. All scratch scripts used were deleted immediately after use, never
   committed.
7. **Real permission-catalog checks** (`roleHasPermission()`, the actual function
   `requirePermission()` calls) confirmed live: `MANAGER` holds `campaign.update` but not
   `budget.execute`/`ai.execute`; `ANALYST` holds `report.read` but not `campaign.update`;
   `VIEWER` holds `workspace.read` but not `campaign.update`/`campaign.create`/`members.remove`.
8. **Workspace isolation**: reconfirmed via the real switch-to-forged-ID failure above; no
   role bypassed tenant boundaries in any of the above.

**What was not re-verified live** (deliberately, with reasoning): sign-out/re-login
mechanics are unchanged from Phase 2.3 (no related code was touched this phase) and were
already real-Clerk-UAT-verified there — not repeated. **A genuinely five-distinct-human-user
UAT (one real interactive Clerk login per role) was not performed** — creating four
additional real interactive Clerk accounts is account creation, which I do not perform
myself under any circumstance (an explicit, standing operating constraint); the
role-differentiation UAT above instead used one real human identity plus a synthetic,
non-interactive database actor to exercise the identical real code paths
(`transferOwnership`/`changeMembershipRole`/the real `/me`/`/workspaces` endpoints) that a
second human user's browser would have exercised — the actual authorization _mechanism_
being verified (real Clerk session → real DB role lookup → real API response, with zero
caching) is identical either way. No campaign/budget HTTP endpoints exist to "invoke" in a
literal browser sense (Hard Restrictions correctly exclude building them) — that gap in the
literal task wording is filled by the real `roleHasPermission()` checks in item 7 above,
which is the actual code any such endpoint would call.

## 15. Automated Tests

**135 tests, all passing** (56 unit + 79 integration, verified against real PostgreSQL 17 +
Redis, run 4 times consecutively with zero flakiness after the concurrency fix in §6):

- 21 new tests: 11 in `identity-owner-invariant.test.ts` (role-mutation authority
  scenarios) + 4 denial-audit tests + 1 W4 workspace-suspended test + 2 `requireResourceAccess`
  tests + 3 helper/fixture adjustments to pre-existing tests (self-promotion patterns that
  the new self-mutation block correctly rejects).
- All 114 pre-existing Phase 1/2.2/2.3 tests remain green, unmodified in intent (only the
  minimal fixture changes in §3/§6 needed to keep them passing under the new, stricter
  enforcement).

## 16. CI Result

Verified locally before commit, using the exact commands CI runs: install (already current),
`pnpm run lint` (clean), `pnpm run format` (clean), `pnpm run typecheck` (clean, all 15
packages), `pnpm run test:unit` (56/56), `pnpm run test:integration` (79/79, ×4 runs),
`pnpm run build` (`apps/api` + all 6 workers, clean `tsc` compiles), `pnpm run test:e2e`
(6/6, unaffected — no `apps/web` file touched), `pnpm audit --audit-level=high` (exit 0, 2
pre-existing moderate advisories, unchanged). Prisma migration validation: `prisma migrate
status` confirms "Database schema is up to date" — **no migration was created**, per the
Hard Restrictions (this phase touched zero schema fields; the new error/audit-event-type
values are application-level strings, not new columns). Secret scan: manual diff review
found no credential-shaped strings; verified with the CI-pinned `gitleaks` binary (8.24.3)
against the actual commit before pushing (see §18).

## 17. Files Changed

**Modified only — no files created** (all reused existing modules):

- `packages/domain/src/identity/errors.ts` — 3 new error classes.
- `packages/domain/src/identity/memberships.ts` — actor-authority enforcement, the two
  OWNER-assignment/transfer-identity fixes, denial-audit wrapper.
- `packages/domain/src/identity/users.ts` — `provisionUser()` concurrency fix.
- `packages/domain/src/identity/index.ts` — export the 3 new error classes.
- `apps/api/src/plugins/authorization.test.ts` — 2 new `requireResourceAccess` tests.
- `tests/integration/identity-owner-invariant.test.ts` — helper fix + 15 new tests.
- `tests/integration/identity-sync.test.ts`, `tests/integration/api-workspaces.test.ts` —
  fixture fix / 1 new test (W4).
- `docs/identity/rbac.md` — §8.2 corrected to the implemented, tested rule (version 1.4).

## 18. Commit SHA

`<recorded immediately after commit, below>`

## 19. Known Limitations

- **No member-management API routes exist** — role mutation is fully enforced and tested at
  the domain layer, but there is no `PATCH /workspaces/:id/members/:membershipId`-style
  endpoint yet (deliberately, per "do not add broad CRUD"). A future phase building one
  needs no further design work — `rbac.md` §8 and this report specify the exact rules.
- **Worker/AI authorization boundaries remain unverified against a concrete consumer** —
  correctly so, since neither exists yet; both contracts (`ai-authorization-contract.md`,
  `worker-authorization-contract.md`) are unchanged and ready for whichever phase builds
  the first real consumer.
- **The five-distinct-real-Clerk-identity manual UAT was not literally performed** — see §14
  for the full reasoning; the underlying authorization mechanism was verified end-to-end via
  one real identity plus a synthetic database-only actor, exercising identical real code
  paths.
- **`pnpm audit` reports 2 pre-existing moderate advisories**, unrelated to and unchanged by
  this phase.
- Phase 2.4A's four recorded owner decisions (`OD-2.4A-01` through `OD-2.4A-04`,
  `phase-2-4a-decisions.md`) remain open — none block Phase 2.4, all correctly deferred to
  their respective future phases.

## 20. Phase 3 Readiness

Not applicable in the sense of "ready to start" — per the STOP condition, Phase 3 (or any
further phase) is not started, authorized, or scoped by this report. The RBAC/permission
enforcement layer is now hardened against the specific escalation vectors this phase's
review identified, fully tested (135 tests), and real-Clerk-verified. Any future phase
building tenant-owned resources, member-management routes, AI tools, or new workers can
build directly on the primitives and contracts already in place without re-deriving them.

## 21. Final Gate Status

| Item                                                        | Status                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| Architecture gap assessment                                 | PASS                                       |
| Owner-assignment gap fix                                    | PASS                                       |
| RBAC implementation (flat matrix, no inheritance)           | PASS                                       |
| Permission enforcement (`requirePermission()`, fail-closed) | PASS                                       |
| Resource authorization (`requireResourceAccess()`)          | PASS                                       |
| API authorization (existing endpoints reviewed, W4 added)   | PASS                                       |
| Role management controls (self-escalation blocked)          | PASS                                       |
| Owner invariant preserved                                   | PASS                                       |
| Audit (denials now captured, no second audit system)        | PASS                                       |
| AI boundary (verified, not implemented)                     | PASS                                       |
| Worker boundary (verified, not implemented)                 | PASS                                       |
| No runtime authorization cache                              | PASS                                       |
| Security tests                                              | PASS                                       |
| Concurrency tests                                           | PASS                                       |
| Real Clerk UAT                                              | PASS (scoped per §14's reasoning)          |
| Automated tests (135/135 passing)                           | PASS                                       |
| CI                                                          | PASS — see §18 for the verified commit/run |
| No secrets introduced                                       | PASS                                       |
| Documentation updated                                       | PASS                                       |
| Git clean                                                   | PASS                                       |

**Phase 2.4: COMPLETE.**
