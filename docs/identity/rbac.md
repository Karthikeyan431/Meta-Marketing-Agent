# RBAC — Roles and Permissions

**Document ID:** IDENT-005 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

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
Whether `APPROVER` should instead be reinstated as a sixth distinct role (e.g., for
agencies wanting a client-side approver with no other management rights) is recorded as an
open decision in `phase-2a-decisions.md` — the permission-based model above is the
recommendation, not a final decision.

## 2. Role Semantics

| Role        | Summary                                                                                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OWNER**   | Full control, including workspace deletion, ownership transfer, and every ADMIN permission. Exactly one implied "cannot be removed by anyone but themselves or a transfer" invariant — the workspace can never end up with zero owners as a side effect of a membership removal. |
| **ADMIN**   | Full operational control: manage members/roles, Meta connections, campaigns, reports, AI usage. Does **not** implicitly gain `budget.approve`/`budget.execute` — see §4.                                                                                                         |
| **MANAGER** | Day-to-day campaign management: create/update/pause campaigns, use AI chat/propose, read reports. No member management, no Meta connection lifecycle, no financial approval/execution by default.                                                                                |
| **ANALYST** | Read-only across campaigns/reports/AI read/insights, plus report creation/export (reporting is not a mutation of advertising state). No campaign or budget mutation rights at all.                                                                                               |
| **VIEWER**  | Read-only, narrower than ANALYST — no report creation/export, no AI chat (may still have `ai.read` if the product wants viewers to see AI-generated summaries already produced by others; see permission matrix).                                                                |

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

## 5. Per-Membership Overrides (explicit non-decision)

Whether a specific membership can be granted permissions beyond its role's default (e.g. a
MANAGER granted `budget.approve` for one workspace without becoming a full ADMIN) is left
open — see `phase-2a-decisions.md` and `identity-data-model.md` §Role/Permission Storage
Reasoning for the schema implication either way.

## 6. Dangerous-Permission Discipline

Per the governing task's explicit instruction: **the existence of a permission in this
catalog does not mean it should be enabled by default, or at all, until the enforcement
pipeline that gates it actually exists.** Concretely: `budget.execute` and `ai.execute`
are catalogued now for schema/API-contract stability, but no code path may allow either to
actually cause a Meta mutation until Phase 9's action/policy/approval pipeline is built —
holding the permission in Phase 2–8 is inert by construction, because the execution
pipeline it would authorize does not exist yet.
