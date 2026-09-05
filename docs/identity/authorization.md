# Authorization

**Document ID:** IDENT-003 | Version 1.1 | Status: Approved (Owner Decision, 2026-09-05) | Phase: 2A (Architecture Finalization)

Defines the server-side authorization primitives every protected code path will call, their
contracts and responsibilities, and the deterministic HTTP status rules that prevent
resource enumeration. **Contracts only — no implementation in this phase**, per the Hard
Restrictions.

## 1. The Primitive Chain

Every protected request passes through these primitives, in this order. Each one may only
ever narrow what the next primitive is allowed to see — none may widen access granted by a
previous one.

```text
requireAuth()            → AuthenticatedUser | throws 401
requireWorkspace()        → { user, workspace } | throws 403
requireMembership()       → { user, workspace, membership } | throws 403
requirePermission(perm)    → { ...above, permission: perm } | throws 403
requireResourceAccess(...) → { ...above, resource } | throws 403 | throws 404 (see §3)
```

### `requireAuth()`

**Responsibility:** confirm a valid Clerk session exists and resolve it to our own
`users` row (via `clerkUserId`). Creates no workspace context.
**Failure:** no valid session → `401 Unauthenticated`.
**Never does:** check any permission, workspace membership, or resource ownership.

### `requireWorkspace(workspaceId)`

**Responsibility:** given an _already-authenticated_ user and a workspace identifier taken
from **server-derived context** (the resolved active workspace — see `workspace-model.md`
§Active Workspace Resolution — never a raw client-supplied path/body/query parameter used
as-is), confirm the workspace exists and is not deleted/suspended.
**Failure:** workspace does not exist or is inactive → `403` (see §3 for when this becomes
`404` instead).
**Never does:** assume that resolving a workspace ID implies the user belongs to it — that
is `requireMembership()`'s job. `requireWorkspace()` exists as a distinct step so a
not-a-member-at-all case and a suspended-workspace case can be told apart in logs/tests
even though both return the same status code to the client.

### `requireMembership(user, workspaceId)`

**Responsibility:** confirm an active `workspace_memberships` row exists for exactly this
`(user_id, workspace_id)` pair. This is the step that turns "an authenticated user claims
workspace X" into "a verified member of workspace X" — the single most important check in
the whole chain, since every other tenant-isolation guarantee depends on it being correct
and always executed.
**Failure:** no active membership row → `403`.
**Never does:** trust a workspace ID the client asserts is theirs without this database
check — this is the concrete implementation of `DATA-004` rule #4 and
`TENANT_SECURITY.md`'s "tenant context is established by authenticated membership, not by
a user-provided workspace ID alone."

### `requirePermission(membership, permission)`

**Responsibility:** confirm the role attached to this membership grants the named
permission (see `rbac.md` for the permission catalog and role→permission mapping).
**Failure:** role does not include the permission → `403`.
**Never does:** grant a permission because a _related_ permission is held (e.g. holding
`campaign.update` never satisfies a `budget.execute` check — see `rbac.md` §Financial
Permission Separation).

### `requireResourceAccess(membership, resourceType, resourceId)`

**Responsibility:** resolve the actual resource row and confirm its `workspace_id` column
equals the authorized workspace's ID. This is the concrete, mechanical implementation of
the IDOR/BOLA rule below.
**Failure:** resource not found in this workspace → see §3 for 403-vs-404.
**Never does:** perform a lookup by resource ID alone and separately "check" the workspace
— the query itself must carry both conditions so there is no window where an unscoped row
is held in memory before being checked.

## 2. The IDOR/BOLA Rule (mechanical form)

```text
# WRONG — resource ID alone
SELECT * FROM campaigns WHERE id = :requestedId;

# RIGHT — resource ID AND authorized workspace, in the same query
SELECT * FROM campaigns WHERE id = :requestedId AND workspace_id = :authorizedWorkspaceId;
```

`GET /campaigns/:id` must never be implemented as "find campaign by id" — it is always
"find campaign WHERE id = requestedId AND workspace_id = authorizedWorkspaceId" (`API-006`).
This rule applies identically to:

- the HTTP API (every route handler)
- background workers (see §4)
- report generation (a report referencing a campaign must re-verify that campaign's
  workspace at generation time, not trust the report's own stored reference blindly)
- Meta-resource lookups (external Meta IDs are looked up **within** the authorized
  workspace's own synced data, never as a global external-ID lookup — `DATA-004` rule #10)
- AI tool execution (§6)
- action/approval execution and audit record writes

## 3. 403 vs. 404 — Resource Enumeration Policy

| Situation                                                                                                                              | Status | Why                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No valid session at all                                                                                                                | `401`  | Nothing to authorize yet — this is purely "who are you."                                                                                                                                                                                                                                                                                                                                                                               |
| Valid session, but the caller has no membership in the target workspace whatsoever                                                     | `403`  | The workspace's _existence_ is not secret (workspace IDs are not treated as capability tokens anywhere in this design); revealing "you're not a member" vs. "this doesn't exist" is an acceptable disclosure here since workspace membership itself is the boundary being enforced, and a `403` is more useful for legitimate clients debugging access issues.                                                                         |
| Valid session, valid membership, but the **specific resource** (campaign/report/action/etc.) does not belong to the caller's workspace | `404`  | This is the resource-enumeration-sensitive case: a `403` here would confirm to an attacker "a resource with this ID exists, you're just not allowed to see it," letting them enumerate valid IDs across workspaces. Returning `404` makes "exists in another workspace" and "does not exist at all" indistinguishable, matching `requireResourceAccess()`'s query shape in §2, which cannot itself distinguish those two cases either. |
| Valid session, valid membership, resource belongs to this workspace, but the role lacks the required permission                        | `403`  | The resource's existence is already known to be legitimate for this workspace; only the operation is denied.                                                                                                                                                                                                                                                                                                                           |

This directly mirrors current Clerk documentation's own `auth.protect()` behavior (throws
404 on failure, not 403 — `clerk-integration.md` finding #4), and is consistent with
`API-006`'s "a URL never implies authorization" principle.

## 4. Workers Are Not Exempt

A background worker (see the six workers in `WORKER_ARCHITECTURE.md`) never runs with an
ambient "internal, therefore trusted" privilege. Every job payload carries an explicit,
**verified** workspace scope — verified meaning the job was enqueued by code that already
ran the authorization chain above, and the worker re-derives/re-checks the workspace
relationship of every resource it touches using the same `requireResourceAccess()`-shaped
query, not a bespoke internal-only code path (`DATA-004` rule #5, `SEC-004` §Background
Jobs). A worker process compromised or fed a tampered payload must fail the same way an
external attacker would.

## 5. Caching, Reports, and Audit Are Not Exempt Either

- Cache keys must include workspace scope (`DATA-004` rule #7) — a cache key derived only
  from a resource ID risks serving workspace A's cached data to workspace B if IDs ever
  collide across a future schema change or migration bug.
- Reports must be workspace-scoped both at generation time and at retrieval time (`DATA-004`
  rule #8) — a report URL/ID is not itself a capability token.
- Audit events are always written with the workspace ID of the action being audited
  (`DATA-004` rule #9), and audit _reads_ go through the same authorization chain as any
  other resource.

## 6. AI ≠ Authorization

```text
AI
 ↓
Tool request (typed, schema-validated)
 ↓
requireAuth() / requireWorkspace() / requireMembership() / requirePermission()
   — using the INITIATING USER's current permissions, re-evaluated per call
 ↓
requireResourceAccess() for every resource the tool touches
 ↓
Action policy (financial/risk gating — Phase 9 scope)
 ↓
Approval (Phase 9 scope)
 ↓
Execution
```

The model **never** selects a workspace, never receives a standing/elevated credential,
and never causes a tool call to skip any primitive in §1. A tool call is authorized
exactly as if the same user had called the equivalent API endpoint directly — because
internally, it does (`SEC-004` §AI, `API-006` §AI Endpoints, `AI-007`, `ADR-002-AI-EXECUTION-BOUNDARY`).
If a future conversation context spans multiple workspaces (not a Phase 2 concern), the
tool call must still resolve and re-verify a single explicit workspace per call — an AI
tool is never given an ambiguous or "current conversation's" workspace without that
resolution passing through `requireWorkspace()`/`requireMembership()` like any other
caller.

## 7. What This Document Does Not Cover

Action policy evaluation, financial limit enforcement, and the approval workflow itself
are `SEC-009`/`SEC-010` concerns and are Phase 9 (Controlled AI Actions) implementation
scope. This document stops at "is this call allowed to reach the resource at all" — the
next question, "is this specific mutation within policy," is a distinct, later gate.
