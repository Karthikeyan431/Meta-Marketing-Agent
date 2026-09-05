# Workspace Model

**Document ID:** IDENT-007 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

## 1. Entities

```text
User            — one row per Clerk-authenticated human, keyed by clerkUserId
Workspace       — the tenant; owns every resource in multi-tenancy.md's ownership tree
Membership      — join row: (user_id, workspace_id) → role, status
Role            — OWNER/ADMIN/MANAGER/ANALYST/VIEWER (rbac.md)
Permission      — the catalog in rbac.md §3
```

- A **User** may hold memberships in **multiple Workspaces** (many-to-many via
  Membership).
- A **Workspace** may contain **multiple Users** (again via Membership).
- Membership, not User and not Workspace alone, is what carries the Role.

## 2. Clerk Organization ↔ Application Workspace Mapping

**Recommendation (proposed, not decided — see `phase-2a-decisions.md`): one Clerk
Organization per application Workspace, 1:1, with our `workspaces` table holding a
`clerk_org_id` reference column.**

Rationale:

- Clerk Organizations natively model "a user switches between team contexts" (verified
  wording — `clerk-integration.md` finding #5), which is exactly our Workspace concept, and
  gives us Clerk-native UI (organization switcher, invitation flows) for free if we choose
  to use it.
- **This mapping is a convenience, not an authorization mechanism.** Clerk's own Organization
  role/permission (`org:admin`/`org:member`, or custom `org:*` roles) is **not** used for
  our authorization decisions at all — our `workspace_memberships.role` is the only role
  that matters to `requirePermission()`. See `clerk-integration.md` finding #6 and
  `authorization.md` §1.
- The 1:1 mapping has the cost implication already flagged in `clerk-integration.md`
  finding #5 (free-tier MRO limits) — an explicit open decision, not resolved here. An
  alternative (Clerk used only for individual user identity, with Workspace existing
  purely in our own database with no Clerk Organization counterpart at all) remains viable
  and is recorded as the fallback option in `phase-2a-decisions.md`.

## 3. Active Workspace Resolution

For a signed-in user with one or more memberships, the **active workspace** for a given
request is resolved server-side as follows, every request, never cached client-side as an
authorization fact:

1. Resolve the authenticated Clerk identity (`requireAuth()`).
2. Determine the _claimed_ active workspace: a value stored in a **server-controlled**
   session-adjacent record (not a bare cookie/header value trusted at face value) — the
   exact storage mechanism (Clerk session claim vs. our own server-side session/cache
   record) is a Phase 2 implementation decision, not resolved here; either way the value is
   never taken as authorization-sufficient on its own.
3. Run `requireMembership()` against that claimed workspace ID. If it fails (revoked,
   deleted, never valid, or forged), the request is rejected — the server never silently
   falls back to "pick any workspace this user belongs to" for a request that explicitly
   named a workspace.
4. If no active workspace is claimed at all (e.g., first request after sign-in) and the
   user has exactly one membership, that membership's workspace becomes the resolved
   active workspace. If the user has more than one membership and none is claimed, the
   request/UI must require an explicit selection — the server does not guess.
5. Once resolved and verified, that `{user, workspace, membership}` context is what every
   subsequent primitive in `authorization.md` §1 consumes for the remainder of the request.

## 4. Workspace Switching (safe design)

Restated from the governing task, made concrete:

1. Obtain the authenticated Clerk identity (`requireAuth()`).
2. Client requests to switch to workspace `W` (a user-initiated UI action, e.g. an
   organization switcher) — this request itself carries no authorization weight yet.
3. **Verify membership**: `requireMembership(user, W)`. If it fails, the switch is
   rejected with `403`/`404` per `authorization.md` §3 (a workspace ID the user was never a
   member of, or is no longer a member of, is treated the same as a nonexistent one for
   this purpose — no enumeration signal).
4. On success, establish the new authorized active-workspace context server-side (updating
   whatever mechanism §3 step 2 designates — a new session claim, a server-side record, or
   equivalent).
5. **Every subsequent API/resource access uses this newly established context** — not the
   previous workspace's context, and not a client-remembered value from before the switch.

**A workspace ID supplied by the browser is never trusted as proof of authorization at any
point in this flow** — step 3's database check is what actually authorizes the switch; the
browser's request is only ever a _request to switch_, never a switch itself.

## 5. Invariants

- A workspace can never end up with zero `OWNER` memberships as a side effect of a member
  removal, role change, or workspace deletion race — the exact mechanism (block the last
  owner from removing themselves; require explicit ownership transfer first) is a Phase 2
  implementation decision, not resolved here, but the invariant itself is a hard
  requirement.
- Deactivating/removing a membership takes effect on the **next** request check, not
  retroactively on requests already in flight, and not delayed by any caching of
  membership state beyond the lifetime of a single request (`DATA-004` rule #7's
  workspace-scoped cache-key rule applies here too — a cached "is member" result must
  itself be workspace-and-user-scoped and short-lived enough not to outlive a revocation in
  practice).
