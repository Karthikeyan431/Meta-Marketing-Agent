# RBAC — Roles and Permissions

**Document ID:** IDENT-005 | Version 1.3 | Status: Approved (Owner Decision, 2026-09-05); §§7–9 added Phase 2.4A (2026-09-10, architecture finalization — see `phase-2-4a-decisions.md`) | Phase: 2A / 2.4A

`SEC-004` (RBAC_AUTHORIZATION.md) explicitly states its own example roles
(OWNER/ADMIN/MARKETER/ANALYST/APPROVER/VIEWER) are "product concepts; exact permissions
must be explicitly defined" — i.e., not binding. This document defines the actual working
model for Phase 2.

## 1. Role Reconciliation (explicit, not silent)

| SEC-004 example role | This document's role                | Reasoning                                                                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER                | **OWNER**                           | Kept as-is — the workspace creator/ultimate authority.                                                                                                                                                                                                                                         |
| ADMIN                | **ADMIN**                           | Kept as-is — full operational control short of workspace deletion/ownership transfer.                                                                                                                                                                                                          |
| MARKETER             | **MANAGER**                         | Renamed to match this phase's task instructions. Covers day-to-day campaign management.                                                                                                                                                                                                        |
| ANALYST              | **ANALYST**                         | Kept as-is — read + reporting, no mutation rights.                                                                                                                                                                                                                                             |
| APPROVER             | _(not a separate role — see below)_ | Modeled as a **permission** (`budget.approve`), not a dedicated role, so it composes: any role that should be able to approve (commonly OWNER/ADMIN, optionally MANAGER) can be granted it without needing users to hold two roles or a role-combination mechanism this phase does not design. |
| VIEWER               | **VIEWER**                          | Kept as-is — read-only.                                                                                                                                                                                                                                                                        |

**Working role set for Phase 2: `OWNER`, `ADMIN`, `MANAGER`, `ANALYST`, `VIEWER`.**
**Owner-accepted 2026-09-05** (`phase-2a-owner-decision-package.md` OD-03, via the owner's
Role Model acceptance): `APPROVER` is modeled as a permission (`budget.approve`), not a
sixth distinct role. If a concrete future requirement emerges (e.g., agencies wanting a
client-side approver with no other management rights), reinstating it as a distinct role
would need a new decision — this is not expected to be revisited without one.

## 2. Role Semantics

| Role        | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OWNER**   | Full control, including workspace deletion, ownership transfer, and every ADMIN permission. Exactly one implied "cannot be removed by anyone but themselves or a transfer" invariant — the workspace can never end up with zero owners as a side effect of a membership removal.                                                                                                                                                                                                                   |
| **ADMIN**   | Full operational control: manage members/roles, Meta connections, campaigns, reports, AI usage, and financial approval/execution (`budget.approve`/`budget.execute` — matches the permission matrix in §3; this row previously and incorrectly stated the opposite, corrected during the Phase 2A decision-package review). Still subject to the separately-gated financial enforcement pipeline in §4 — holding the permission is necessary, never sufficient, for an actual mutation to execute. |
| **MANAGER** | Day-to-day campaign management: create/update/pause campaigns, use AI chat/propose, read reports. No member management, no Meta connection lifecycle, no financial approval/execution by default.                                                                                                                                                                                                                                                                                                  |
| **ANALYST** | Read-only across campaigns/reports/AI read/insights, plus report creation/export (reporting is not a mutation of advertising state). No campaign or budget mutation rights at all.                                                                                                                                                                                                                                                                                                                 |
| **VIEWER**  | Read-only, narrower than ANALYST — no report creation/export, no AI chat (may still have `ai.read` if the product wants viewers to see AI-generated summaries already produced by others; see permission matrix).                                                                                                                                                                                                                                                                                  |

## 3. Permission Catalog

Every permission below is evaluated by `requirePermission()` (`authorization.md` §1) after
membership is confirmed. Permission names use `resource.action` form, consistent with how
`API-006`/`SEC-004` describe operations, and are **application-owned** — independent of
Clerk's own permission-naming convention (`org:<feature>:<permission>` —
`clerk-integration.md` finding #6), since these are never Clerk Organization permissions.

### Workspace

| Permission         | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| ------------------ | :---: | :---: | :-----: | :-----: | :----: |
| `workspace.read`   |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `workspace.update` |  ✅   |  ✅   |         |         |        |
| `workspace.delete` |  ✅   |       |         |         |        |
| `members.read`     |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `members.invite`   |  ✅   |  ✅   |         |         |        |
| `members.update`   |  ✅   |  ✅   |         |         |        |
| `members.remove`   |  ✅   |  ✅   |         |         |        |

### Meta Connections

| Permission                   | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| ---------------------------- | :---: | :---: | :-----: | :-----: | :----: |
| `meta_connection.read`       |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `meta_connection.connect`    |  ✅   |  ✅   |         |         |        |
| `meta_connection.reconnect`  |  ✅   |  ✅   |         |         |        |
| `meta_connection.disconnect` |  ✅   |  ✅   |         |         |        |

### Campaigns

| Permission        | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| ----------------- | :---: | :---: | :-----: | :-----: | :----: |
| `campaign.read`   |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `campaign.create` |  ✅   |  ✅   |   ✅    |         |        |
| `campaign.update` |  ✅   |  ✅   |   ✅    |         |        |
| `campaign.pause`  |  ✅   |  ✅   |   ✅    |         |        |
| `campaign.delete` |  ✅   |  ✅   |         |         |        |

### Reporting

| Permission      | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| --------------- | :---: | :---: | :-----: | :-----: | :----: |
| `report.read`   |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `report.create` |  ✅   |  ✅   |   ✅    |   ✅    |        |
| `report.export` |  ✅   |  ✅   |   ✅    |   ✅    |        |

### AI

| Permission   | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| ------------ | :---: | :---: | :-----: | :-----: | :----: |
| `ai.read`    |  ✅   |  ✅   |   ✅    |   ✅    |   ✅   |
| `ai.chat`    |  ✅   |  ✅   |   ✅    |   ✅    |        |
| `ai.propose` |  ✅   |  ✅   |   ✅    |         |        |
| `ai.execute` |  ✅   |  ✅   |         |         |        |

`ai.execute` is deliberately **not** granted to MANAGER by default even though
`campaign.update` is — see §4. `ai.propose` lets the AI draft an action plan for review;
`ai.execute` is required for the AI's proposal to actually reach the execution step, and is
itself still subject to every gate in `authorization.md` §6 and, for anything
budget-related, §4 below.

### Financial Actions

| Permission       | OWNER | ADMIN | MANAGER | ANALYST | VIEWER |
| ---------------- | :---: | :---: | :-----: | :-----: | :----: |
| `budget.read`    |  ✅   |  ✅   |   ✅    |   ✅    |        |
| `budget.propose` |  ✅   |  ✅   |   ✅    |         |        |
| `budget.approve` |  ✅   |  ✅   |         |         |        |
| `budget.execute` |  ✅   |  ✅   |         |         |        |

`budget.approve`/`budget.execute` are withheld from MANAGER by default in this starting
matrix — a workspace that wants a MANAGER to also approve budgets grants it explicitly per
membership (see §5), rather than the role implying it.

## 4. The Financial Separation Rule (hard requirement, not a default that can quietly change)

> Holding `campaign.create`/`campaign.update`/`campaign.pause`, or any other general
> campaign-management permission, **never** implies holding `budget.propose`,
> `budget.approve`, or `budget.execute`. These are checked as entirely separate
> permissions, every time, with no role granting all of them merely by virtue of granting
> the others.

This is required because Phase 2 defines the _authorization_ foundation only — the actual
enforcement pipeline these permissions feed into is:

```text
Authentication → Workspace authorization → Permission → Resource authorization
→ Action policy → Financial policy → Approval → Execution → Verification → Audit
```

`budget.propose`/`budget.approve`/`budget.execute` being granted is necessary but not
sufficient to execute a financial mutation — Action Policy, Financial Policy, and Approval
(Phase 9, `SEC-009`/`SEC-010`) still gate the actual mutation regardless of role. **No
financial execution logic exists or is designed for execution in this phase** — these
permission names exist now so the database schema and authorization primitives don't need
a breaking change when Phase 9 arrives.

## 5. Per-Membership Overrides (DEFERRED, owner-accepted 2026-09-05)

Whether a specific membership can be granted permissions beyond its role's default (e.g. a
MANAGER granted `budget.approve` for one workspace without becoming a full ADMIN) is
**DEFERRED** (`phase-2a-owner-decision-package.md` OD-05): Phase 2 uses role-based
authorization only (`Membership → Role → RolePermissions`); the
`membership_permission_overrides` table stays an unpopulated schema placeholder — see
`identity-data-model.md` §Role/Permission Storage Reasoning — until a real customer
requirement justifies building the feature.

## 6. Dangerous-Permission Discipline

Per the governing task's explicit instruction: **the existence of a permission in this
catalog does not mean it should be enabled by default, or at all, until the enforcement
pipeline that gates it actually exists.** Concretely: `budget.execute` and `ai.execute`
are catalogued now for schema/API-contract stability, but no code path may allow either to
actually cause a Meta mutation until Phase 9's action/policy/approval pipeline is built —
holding the permission in Phase 2–8 is inert by construction, because the execution
pipeline it would authorize does not exist yet.

## 7. Role Hierarchy Model (Phase 2.4A)

**Decision (ENGINEERING DEFAULT, consistent with the Phase 2.3 implementation as already
built): the role model is a flat, enumerated capability matrix — not a hierarchy, not
inheritance.** This is a Phase 2.4A architecture question the task explicitly requires
answering rather than assuming ("do not assume OWNER > ADMIN > MANAGER > ANALYST > VIEWER
automatically means inheritance").

**What this means concretely:** `PERMISSION_CATALOG` (`packages/domain/src/rbac-catalog.ts`)
grants each permission to an explicit, independently-authored list of roles (e.g.
`campaign.read: [OWNER, ADMIN, MANAGER, ANALYST, VIEWER]`, `budget.approve: [OWNER, ADMIN]`).
`roleHasPermission(role, permission)` is a direct set-membership lookup against that list —
there is no `role >= threshold` computation, no "ADMIN inherits everything VIEWER has plus
its own additions" logic, and no code path derives one role's permissions from another's.

**Why not a real hierarchy:** for most permissions the catalog _looks_ hierarchical (OWNER
and ADMIN hold a superset of MANAGER's grants, which is a superset of ANALYST's, which is a
superset of VIEWER's) — but this is an emergent property of how the matrix happens to be
authored, not a structural guarantee, and rbac.md §4's financial separation rule
**deliberately breaks strict hierarchy on purpose**: MANAGER holds `campaign.update` but not
`ai.execute` or any `budget.*` permission, even though both would "fit" a naive hierarchy
below ADMIN. A true inheritance model would make it structurally awkward (or require an
explicit "revoke" mechanism) to carve out exactly these exceptions; a flat matrix makes each
high-risk permission an independent, auditable decision with no hierarchy to fight against.

**Security consequence:** reviewing or changing what MANAGER can do never risks silently
changing what OWNER/ADMIN can do (and vice versa) — each row of the matrix is
self-contained. The cost is that adding a new role-supporting-permission requires touching
every relevant permission's role list explicitly (no shortcut of "grant it to ADMIN and
everything below automatically gets it") — an intentional friction that keeps high-risk
grants deliberate. This is a `PERMISSION_CATALOG`-classification, not a database-schema
concern — the `Role` Postgres enum has no ordering semantics Prisma/Postgres itself is aware
of (`WorkspaceMembership.role` is a plain enum column, not a numeric level).

**Role authority order — a separate, narrower concept from permission hierarchy**, used only
for §8's role-assignment gating below: `OWNER > ADMIN > MANAGER > ANALYST > VIEWER`. This
ordering exists solely to answer "who may assign which role to whom" — it does **not** imply
that a higher-ordered role automatically holds every permission a lower-ordered role holds
(§4/§6 above are the counter-examples). Do not conflate the two.

## 8. Role Mutation, Self-Escalation Prevention, and the Owner Invariant (Phase 2.4A)

Phase 2.3 implemented the mutation primitives (`changeMembershipRole()`,
`removeMembership()`, `transferOwnership()` in `packages/domain/src/identity/
memberships.ts`) but built no API route that exposes them yet (Phase 2.3 deliberately
shipped no member-management endpoints). This section is the binding specification any
future route/caller **must** enforce — Phase 2.4A does not implement it, but makes it
unambiguous so Phase 2.4/later implementation requires no further design discussion.

### 8.1 Who may assign/change/remove roles, and create/remove memberships

Gated by the existing permission catalog — `members.invite`, `members.update`,
`members.remove` are held by **OWNER and ADMIN only** (§3 above). No other role can reach
these operations at all — this alone is the primary defense against MANAGER/ANALYST/VIEWER
self- or other-escalation, since `requirePermission()` rejects the call before any role
comparison logic even runs.

### 8.2 The OWNER-assignment gap (identified during Phase 2.4A review — binding for Phase 2.4 implementation)

**Finding:** `changeMembershipRole()`'s `newRole: Role` parameter currently accepts
`"OWNER"` as a value with no special-casing — its only invariant check is against
_demoting_ the workspace's last active owner, not against a _second_ concurrent owner being
created outside the atomic `transferOwnership()` swap. If a future route called
`changeMembershipRole({ newRole: "OWNER", ... })` directly, it would let an ADMIN (who holds
`members.update`) unilaterally promote any member to OWNER — including themselves —
producing a workspace with two OWNERs without any transfer/demotion ever occurring, and
without violating the zero-owners invariant (which only checks the _low_ bound, never the
count going up). This is not currently exploitable (no route calls this function with
attacker-influenced input today), but it is a **latent gap that must be closed before any
member-role-change endpoint ships**.

**Binding rule for Phase 2.4 implementation:**

1. `changeMembershipRole()` must reject `newRole === "OWNER"` unconditionally — assigning
   OWNER is **exclusively** possible through `transferOwnership()`, which already requires
   the acting membership to itself currently hold OWNER (`from.role !== "OWNER"` throws) and
   performs the promotion/demotion as one atomic pair, never a lone promotion.
2. The API layer must additionally enforce, before calling `changeMembershipRole()`: the
   acting membership's role must outrank the **target** role being assigned, using §7's role
   authority order (`OWNER > ADMIN > MANAGER > ANALYST > VIEWER`) — concretely, in practice
   this reduces to "ADMIN may assign ADMIN/MANAGER/ANALYST/VIEWER to others" (MANAGER and
   below hold no `members.update` permission at all, so no further role-vs-role comparison
   is reachable by them regardless).
3. **No membership may change its own role**, under any permission it holds — the acting
   user's `userId` must differ from the target membership's `userId` for every call to
   `changeMembershipRole()`/`removeMembership()`. This is a blanket self-service-escalation
   block, simpler and safer than reasoning about whether a specific self-change would
   "happen" to be safe.
4. `transferOwnership()`'s `fromMembershipId` must belong to the **acting, authenticated**
   user (an OWNER may only transfer away _their own_ ownership, never orchestrate a transfer
   between two other members' memberships on their behalf) — already implicitly true by the
   function's existing invariant checks, restated here as an explicit API-layer requirement.

### 8.3 Owner invariant (restated, unchanged from Phase 2.3)

A workspace may never end up with zero active OWNER memberships. Enforced transactionally
with `SELECT ... FOR UPDATE` row locking (`packages/domain/src/identity/memberships.ts`) —
see `phase-2-3-implementation-report.md` §10 for the concurrency-safety verification. Rule
8.2's fix (rejecting `newRole === "OWNER"` in `changeMembershipRole()`) is additive to this
invariant, not a replacement for it — both must hold simultaneously.

## 9. Cross-Workspace Role Confusion (Phase 2.4A)

**A user's role is a property of their `WorkspaceMembership` row, never a property of the
user themselves.** The same Clerk-authenticated `User` may hold `OWNER` in Workspace A and
no membership at all (or `VIEWER`) in Workspace B — nothing about their identity, their most
recent session, or any other workspace's membership implies authority in a workspace they
are not separately, actively a member of. `requireWorkspaceMembership()`
(`apps/api/src/plugins/authorization.ts`) always re-resolves membership scoped to the
specific `(userId, workspaceId)` pair on every request — it is structurally incapable of
"remembering" a role from a different workspace, since the Prisma query itself is scoped to
that compound key. No code path anywhere holds a bare `role` value without the
`(userId, workspaceId)` pair it came from. See `identity-threat-model.md` threat #4
("Workspace switching attack") and #16 (added Phase 2.4A, §"Cross-workspace role reuse") for
the corresponding negative tests.
