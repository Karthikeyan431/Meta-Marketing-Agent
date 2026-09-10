# Phase 2.5 Implementation Report — Member-Management API Surface

**Document ID:** IDENT-024 | Version 1.0 | Status: Complete | Phase: 2.5 (Implementation)

## 1. Baseline

Entering Phase 2.5: HEAD `ad5de4db1bf256655ff7a7d351957fe1a43bc554` (Phase 2.4, amended for
OD-2.4A-01/03). Working tree clean, verified before any change.

**"Phase 2.5" does not exist in the governing SDLC corpus.** `IMPLEMENTATION_PHASES.md`
(`DEVREADY-004`, the master roadmap) and `docs/implementation/implementation-plan.md` both
define only whole-number phases — Phase 2 ("Identity & Multi-Tenancy") is immediately
followed by Phase 3 ("Meta Connection"); no `.5` sub-phase appears anywhere in either
document, or in any of the `ai-marketing-manager-gate-*-docs` corpora, or in `services/`.
The `2.1`/`2.2`/`2.3`/`2.4`/`2.4A` numbering is this project's own incremental,
session-by-session decomposition of Phase 2 — invented as work progressed, not a
corpus-defined unit. This was surfaced to the owner before any change was made; the owner
confirmed the scope: **finish the member-management API routes that Phase 2.4 deliberately
deferred**, per `phase-2-implementation-sequence.md` §4's already-designed (but
not-yet-authorized-to-execute) plan.

## 2. Requirements/Architecture Reconciliation

`phase-2-implementation-sequence.md` §4 ("Phase 2.4 Implementation Sequence — planning
input, produced by Phase 2.4A") specified 5 steps; step 1 (close the OWNER-assignment gap)
was executed as part of actual Phase 2.4. Steps 2–5 were explicitly excluded from Phase 2.4's
actual execution (that task's Hard Restrictions said "do not add broad CRUD") and recorded as
a Known Limitation: "No member-management API routes exist yet." This phase executes those
remaining steps:

- Step 2: member-management API routes (`PATCH`/`DELETE .../members/:membershipId`).
- Step 3: `POST /workspaces/:id/ownership-transfer`.
- Step 4: the 9 `REQUIRED (Phase 2.4)` tests from `phase-2-4a-test-matrix.md`.
- Step 5: `AuditEvent` coverage for the new route categories (already written by the
  underlying domain functions since Phase 2.3/2.4 — this phase verifies the HTTP surface
  reaches them, not new audit-logging code).

Reconciled against `rbac.md` §8 (role-mutation authority, self-escalation prevention, the
amended OWNER-assignment rule), `authorization.md` §1–3 (the primitive chain, resource
enumeration policy), and `identity-api-contracts.md` §1–3 (primitive contracts, the
illustrative endpoint surface, audit requirements). No redesign was needed or performed —
every route is a thin HTTP wrapper around the already-built, already-tested Phase 2.3/2.4
domain functions (`changeMembershipRole()`, `removeMembership()`, `transferOwnership()`).

**One design point beyond what the sequence explicitly specified:** `identity-api-
contracts.md` §2's `transferOwnership`-shaped endpoint isn't listed there at all (only
`phase-2-implementation-sequence.md` §4 step 3 specifies it, "same authorization chain" as
step 2). I resolved the outgoing-owner (`fromMembershipId`) identity by always deriving it
server-side from the caller's own already-authorized membership, never accepting it as
client input — this is a strict tightening of `transferOwnership()`'s existing `actorUserId`
check (ADR-028), not a new authorization decision, and eliminates an entire spoof class
before it can reach the domain layer.

## 3. Decisions and Blockers

**Blocked, excluded from this phase's implementation:** `POST /workspaces/:id/members/invite`.
`identity-api-contracts.md` lists it as part of the "illustrative" endpoint surface, but this
codebase's actual, already-approved architecture (`clerk-integration.md`: "Clerk
**Organizations** are used only as a convenience mirror of workspace membership for Clerk's
own UI components (organization switcher, **invitation UI**)") means membership creation is
Clerk-sync-driven only (`createWorkspaceWithOwner()`, `upsertMembershipFromSync()` — both
sync-triggered, never request-triggered, since Phase 2.3). Building this route now would
require inventing one of:

1. A new Clerk Backend API integration (`organizations.createOrganizationInvitation()`) —
   real design decisions with no existing spec: what Clerk-side role to pass, redirect URL,
   already-invited-user handling, revocation.
2. A local-only `WorkspaceMembership` row created outside Clerk sync — actively wrong: it
   would desynchronize from the real Clerk Organization and get fought by the next
   reconciliation pass, which treats Clerk as authoritative.

Neither is specified anywhere, and guessing at either is exactly what "do not silently
resolve ambiguous requirements" rules out. **Owner decision needed**: which invitation
mechanism this route should use, before it can be implemented. No code was written toward
this route.

No other blockers were found. `POST /workspaces/:id/ownership-transfer`'s scope point (§2
above) was a specification tightening I made and am reporting, not a blocker.

## 4. Files Changed

- `packages/contracts/src/identity.ts` — `membershipStatusSchema`, `membershipSummarySchema`,
  `changeMembershipRoleRequestSchema`/`ResponseSchema`, `removeMembershipResponseSchema`,
  `transferOwnershipRequestSchema`/`ResponseSchema`.
- `packages/contracts/src/index.ts` — barrel exports for the above.
- `apps/api/src/plugins/authorization.ts` — `mapMembershipMutationError()`, mapping the 5
  domain-layer identity error classes to the existing HTTP error classes (no new HTTP error
  classes were needed).
- `apps/api/src/routes/workspaces.ts` — `PATCH`/`DELETE /workspaces/:id/members/:membershipId`,
  `POST /workspaces/:id/ownership-transfer`.
- `tests/integration/api-workspace-members.test.ts` (new) — 19 tests.

No unrelated files changed (diff-stat verified against pre-phase HEAD).

## 5. Implementation Details

Each route follows the identical, already-specified chain: `requireAuth()` →
`requireWorkspaceMembership()` → `requirePermission()` → (for role-change/removal)
`requireResourceAccess()` on the target `:membershipId` → the existing domain mutation
function inside its own transaction (self-escalation, OWNER-assignment, owner-invariant, and
audit all re-verified there, per ADR-028 — never trusted from this route's own checks alone).

- **`PATCH /workspaces/:id/members/:membershipId`**: gated by `members.update`;
  `requireResourceAccess` confirms the target belongs to `:id` before `changeMembershipRole()`
  is ever called.
- **`DELETE /workspaces/:id/members/:membershipId`**: self-removal ("leave the workspace")
  bypasses the `members.remove` permission check entirely, matching `removeMembership()`'s own
  role-blind self-removal exemption (rbac.md §8.2 rule 2) — otherwise a VIEWER could never
  leave a workspace via this route. Removing another member still requires `members.remove`.
- **`POST /workspaces/:id/ownership-transfer`**: gated by `members.update`; `fromMembershipId`
  is always the caller's own membership (never client input — see §2).

`mapMembershipMutationError()` translates `MembershipNotFoundError` → 404,
`InsufficientRoleAuthorityError`/`SelfRoleMutationError`/`OwnerAssignmentNotAllowedError` →
403, `OwnerInvariantError` → 409; anything unrecognized is rethrown unchanged (falls to the
existing 500 handler) rather than reinterpreted.

## 6. Tests and Verification Results

19 new integration tests (`tests/integration/api-workspace-members.test.ts`), all against the
real HTTP surface via Fastify `app.inject()` with a real Postgres-backed workspace/membership
fixture (not mocked beyond the Clerk token-verification boundary, matching the existing
`api-workspaces.test.ts` pattern). Covers all 9 `REQUIRED (Phase 2.4)` test-matrix items now
exercisable at the route level for the first time: W4 (already covered pre-existing),
**E1** (self-role-elevation, 403), **E2** (ADMIN→OWNER rejected 403; OWNER→OWNER co-ownership
grant succeeds 200), **E3** (MANAGER rejected before role-comparison, 403), **E4**
(client-supplied extra body fields ignored), **E5-adjacent** (cross-workspace `membershipId`/
`toMembershipId` → 404, for all three routes), **C2** (two concurrent role-change requests to
one membership — exactly one role wins, no corruption), **C3/TOCTOU** (membership removed
between route-level resolution and domain-layer mutation → 404, fails closed), **F5** (409
CONFLICT for the owner invariant, exercised through PATCH and DELETE).

- Lint: clean. Format: clean. Typecheck: clean, all 15 packages.
- Unit: 62/62 (unchanged).
- Integration: **98/98** (79 prior + 19 new), zero regressions.
- `apps/api` + all 6 worker builds: clean `tsc`.
- `apps/web` `next build`: compiles/typechecks/generates all pages; hits the same
  pre-existing Windows-only `EPERM`/symlink trace-copy limitation recorded since
  `phase-2-3-implementation-report.md` §19 — not reproducible on CI's Ubuntu runner.
- E2E: 6/6, unaffected.

## 7. Security Verification

IDOR/BOLA and cross-workspace isolation: verified for all three new routes via the
E5-adjacent tests — a `membershipId`/`toMembershipId` from a different workspace is always
404, never authorized cross-tenant. Privilege escalation: E1/E2/E3 confirm self-escalation,
ADMIN→OWNER, and sub-`members.update`-role attempts are all rejected with the correct status
and error code. Client-input spoofing: E4 confirms extra/forged body fields are inert (zod's
`.parse()` strips unknowns; the actor's permission is always read from the DB-resolved
membership, never the request body). Concurrency: C2/C3 confirm no state corruption under
concurrent mutation and fail-closed behavior when a membership is removed mid-flight.
`gitleaks` 8.24.3 (CI-pinned version) scanned the staged diff — no leaks found.

## 8. Migration/Database Results

**Not applicable — no schema change.** This phase added no Prisma model fields; every route
operates on the existing `WorkspaceMembership` shape. `prisma migrate status`: "Database
schema is up to date!" both before and after this phase's changes.

## 9. CI Result and Run URL

**Green.** Run `34467677861` — `completed` / `success`, every stage passed (install, lint,
format check, typecheck, migrations, RBAC seed, unit tests, integration tests, build, web
production build, E2E tests, secret scan, dependency vulnerability scan):
https://github.com/Karthikeyan431/Meta-Marketing-Agent/actions/runs/34467677861

## 10. Commit SHA(s)

`9065655163c4e216e2d0783cda783ba09fbbaf1b` — implementation, pushed to `origin/main`
(`ad5de4d..9065655`), CI-verified green above.

## 11. Known Limitations

- `POST /workspaces/:id/members/invite` is not implemented — blocked, see §3.
- `GET /workspaces/:id/members` (list) is not implemented — `identity-api-contracts.md` §2
  lists it, but it was not named in `phase-2-implementation-sequence.md` §4's step 2 scope
  and wasn't added speculatively; a natural, low-risk follow-up if the owner wants a complete
  member-management surface.
- Request/response body field-level shapes remain, per `identity-api-contracts.md` §4's own
  scoping, provisional until Phase 5's contract-first `/api/v1` OpenAPI pass — the shapes
  implemented here are reasonable and tested but not yet the final locked contract.
- `pnpm audit`: 2 pre-existing moderate advisories, unrelated to and unchanged by this phase.

## 12. Phase 2.5 Gate Status

| Item                                                            | Status                                  |
| --------------------------------------------------------------- | --------------------------------------- |
| Phase 2.5 scope confirmed with owner (no corpus spec existed)   | PASS                                    |
| Member-management routes (PATCH/DELETE) implemented             | PASS                                    |
| Ownership-transfer route implemented                            | PASS                                    |
| Existing authorization primitives reused, none duplicated       | PASS                                    |
| Fail-closed behavior preserved                                  | PASS                                    |
| No later-phase functionality implemented                        | PASS                                    |
| 9 REQUIRED (Phase 2.4) test-matrix items covered at route level | PASS                                    |
| Full regression suite green (98/98 integration, 62/62 unit)     | PASS                                    |
| Lint/format/typecheck/builds/E2E/audit/migration-status clean   | PASS                                    |
| No unrelated changes                                            | PASS                                    |
| Documentation updated                                           | PASS                                    |
| CI green                                                        | PASS — run 34467677861                  |
| `members/invite` route                                          | Blocked — owner decision needed, see §3 |

## 13. Exact Next Action Required from the Owner

One decision, to unblock the remaining member-management gap:

**Which invitation mechanism should `POST /workspaces/:id/members/invite` use?**

- (a) Integrate Clerk's Organization Invitation API (`@clerk/backend`'s
  `organizations.createOrganizationInvitation()`) — the route triggers Clerk's own invite
  email/flow; no local `WorkspaceMembership` row is created until the invitee accepts and
  Clerk syncs the resulting `organizationMembership.created` event, consistent with every
  existing membership-creation path in this codebase.
- (b) Something else the owner specifies.

Until this is decided, the member-management API surface is otherwise complete and usable
for role changes, removal, and ownership transfer of already-synced members.
