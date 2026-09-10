# Permission Catalog — Full Taxonomy

**Document ID:** IDENT-017 | Version 1.1 | Status: Approved (Owner Decision — see `phase-2-4a-decisions.md`) | Phase: 2.4A (Architecture Finalization), amended Phase 2.4 (2026-09-10)

Extends `rbac.md` §3's role→permission matrix with the full per-permission metadata the
Phase 2.4A task requires: category, action type, risk level, resource scope, financial/
approval/AI/worker classification. **Source of truth for the permission set itself remains
`packages/domain/src/rbac-catalog.ts`** (27 permissions, unchanged by this document — no
permission is added, removed, or reassigned here); this document adds metadata columns the
code doesn't need at runtime but implementers and reviewers do.

Risk tiers are `SECURITY_ARCHITECTURE.md`'s existing 3-tier model, applied here for the
first time to the identity permission catalog specifically:

- **Standard** — read-only analytics, reports, searches.
- **Elevated** — state/configuration changes with no direct financial effect.
- **High Risk** — budget/spend changes, bulk mutations, or anything with material financial
  impact.

"AI-invocable (in principle)" and "Worker-invocable (in principle)" answer: **if** a future
AI tool or worker job existed that performed this action, would granting it ever be
appropriate at all — not whether one exists today (none do; Phase 2.4A implements none).
"Never" means the permission must remain human-initiated-only even after AI/worker
capability exists, by design, regardless of any future policy layer.

## Workspace

| Permission         | Category  | Action   | Risk      | Financial | Approval-related | AI-invocable (in principle)                                                                        | Worker-invocable (in principle)                      |
| ------------------ | --------- | -------- | --------- | :-------: | :--------------: | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `workspace.read`   | Workspace | Read     | Standard  |    No     |        No        | Yes — reading own workspace context is routine                                                     | Yes — every worker needs its workspace's basic state |
| `workspace.update` | Workspace | Mutation | Elevated  |    No     |        No        | Yes, with `ai.propose`/approval gating — renaming/config is low-stakes                             | No — workers execute, they don't rename workspaces   |
| `workspace.delete` | Workspace | Mutation | High Risk |    No     |       Yes        | **Never** — irreversible, workspace-destroying; human-only regardless of any future policy layer   | **Never**                                            |
| `members.read`     | Workspace | Read     | Standard  |    No     |        No        | Yes                                                                                                | No — not a worker concern                            |
| `members.invite`   | Workspace | Mutation | Elevated  |    No     |        No        | No — identity/access changes stay human-initiated (see rbac.md §8)                                 | No                                                   |
| `members.update`   | Workspace | Mutation | Elevated  |    No     |        No        | No — role changes stay human-initiated (rbac.md §8's self-escalation discipline extends to AI too) | No                                                   |
| `members.remove`   | Workspace | Mutation | Elevated  |    No     |        No        | No                                                                                                 | No                                                   |

## Meta Connection

| Permission                   | Category        | Action   | Risk     | Financial | Approval-related | AI-invocable (in principle)                                           | Worker-invocable (in principle)                           |
| ---------------------------- | --------------- | -------- | -------- | :-------: | :--------------: | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `meta_connection.read`       | Meta Connection | Read     | Standard |    No     |        No        | Yes                                                                   | Yes — the sync worker reads connection state to run syncs |
| `meta_connection.connect`    | Meta Connection | Mutation | Elevated |    No     |        No        | No — OAuth-adjacent, credential-handling stays human-initiated        | No                                                        |
| `meta_connection.reconnect`  | Meta Connection | Mutation | Elevated |    No     |        No        | No — same reasoning as connect                                        | No                                                        |
| `meta_connection.disconnect` | Meta Connection | Mutation | Elevated |    No     |        No        | With approval — a disconnect can be proposed, never silently executed | No                                                        |

## Campaigns

| Permission        | Category | Action   | Risk      | Financial | Approval-related | AI-invocable (in principle)                                        | Worker-invocable (in principle)                                                                                                                                                                                                                                                                                 |
| ----------------- | -------- | -------- | --------- | :-------: | :--------------: | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `campaign.read`   | Campaign | Read     | Standard  |    No     |        No        | Yes                                                                | Yes — sync/insights/report workers read campaign state                                                                                                                                                                                                                                                          |
| `campaign.create` | Campaign | Mutation | Elevated  |    No     |        No        | Yes, via `ai.propose` → action → approval pipeline (Phase 9)       | No — creation is a proposed action, not a background job trigger                                                                                                                                                                                                                                                |
| `campaign.update` | Campaign | Mutation | Elevated  |    No     |        No        | Yes, same pipeline                                                 | No                                                                                                                                                                                                                                                                                                              |
| `campaign.pause`  | Campaign | Mutation | Elevated  |    No     |        No        | Yes, same pipeline                                                 | Yes, under guardrails (OD-2.4A-03, amended/approved 2026-09-10) — a scheduled/automated pause rule may originate from a worker, but must pass the same deterministic authorization, resource-authorization, approval, and audit requirements as any other execution path; never a bare worker-internal decision |
| `campaign.delete` | Campaign | Mutation | High Risk |    No     |       Yes        | With mandatory approval — deletion is harder to reverse than pause | No                                                                                                                                                                                                                                                                                                              |

## Reporting

| Permission      | Category | Action   | Risk     | Financial | Approval-related | AI-invocable (in principle)                                  | Worker-invocable (in principle)                       |
| --------------- | -------- | -------- | -------- | :-------: | :--------------: | ------------------------------------------------------------ | ----------------------------------------------------- |
| `report.read`   | Report   | Read     | Standard |    No     |        No        | Yes                                                          | Yes                                                   |
| `report.create` | Report   | Mutation | Standard |    No     |        No        | Yes — report generation is non-mutating to advertising state | Yes — the report worker generates reports on schedule |
| `report.export` | Report   | Mutation | Standard |    No     |        No        | Yes                                                          | Yes                                                   |

## AI

| Permission   | Category | Action                   | Risk      | Financial | Approval-related | AI-invocable (in principle)                                                                                                                               | Worker-invocable (in principle) |
| ------------ | -------- | ------------------------ | --------- | :-------: | :--------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `ai.read`    | AI       | Read                     | Standard  |    No     |        No        | N/A — this permission gates _reading AI-generated output_, checked for the human caller, not held by the AI itself                                        | No                              |
| `ai.chat`    | AI       | Read/Interact            | Standard  |    No     |        No        | N/A — same: gates the human's ability to converse with AI                                                                                                 | No                              |
| `ai.propose` | AI       | Mutation (proposal only) | Elevated  |    No     |        No        | N/A — gates whether the human's request may reach the AI's _propose_ capability at all; the AI never "holds" this permission itself (authorization.md §6) | No                              |
| `ai.execute` | AI       | Execution                | High Risk |    No     |       Yes        | N/A — gates whether the human's proposal may reach _execution_; inert until Phase 9's pipeline exists (rbac.md §6)                                        | No                              |

Note on the AI category's "AI-invocable" column: every `ai.*` permission is checked against
the **initiating human user's** membership, never granted to or held by the model itself
(`authorization.md` §6, `AUTHORIZATION_MODEL.md`'s "AI requests inherit the initiating user's
authorized workspace context"). "N/A" above reflects that these rows describe the gate a
human's request to use AI passes through, not something the AI can be said to "invoke."

## Financial Actions

| Permission       | Category | Action                   | Risk      | Financial | Approval-related | AI-invocable (in principle)                                                                                                                                                                                                                                                                                                                          | Worker-invocable (in principle)                                                                                                                                                                                |
| ---------------- | -------- | ------------------------ | --------- | :-------: | :--------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budget.read`    | Budget   | Read                     | Elevated  |    Yes    |        No        | Yes — reading budget state to inform a proposal                                                                                                                                                                                                                                                                                                      | Yes — verification/reporting workers                                                                                                                                                                           |
| `budget.propose` | Budget   | Mutation (proposal only) | High Risk |    Yes    |       Yes        | Yes — this is precisely the "AI proposes, never executes" boundary (`ADR-002-AI-EXECUTION-BOUNDARY.md`, `AI_ARCHITECTURE.md` §2)                                                                                                                                                                                                                     | No                                                                                                                                                                                                             |
| `budget.approve` | Budget   | Approval                 | High Risk |    Yes    |       Yes        | **Never** — an AI can draft a proposal but can never hold or exercise approval authority (`ACTION_APPROVAL_SECURITY.md`'s "No Approval Bypass": "AI cannot approve its own high-risk action unless a separately defined, deterministic auto-approval policy explicitly permits that operation" — no such policy exists or is proposed in Phase 2.4A) | No                                                                                                                                                                                                             |
| `budget.execute` | Budget   | Execution                | High Risk |    Yes    |       Yes        | **Never** directly — execution happens only after a human (or an explicit, separately-approved auto-approval policy) has approved; the executing code path is application-owned, not AI-invoked, even when the proposal originated from AI                                                                                                           | Yes, but **only** as the trusted executor of an already-fully-approved action (Phase 9 scope) — a worker never independently decides _to_ execute, it carries out a decision already made and audited upstream |

## Cross-Cutting Notes

- **No permission in this catalog is currently "inert-but-invocable"** — Phase 2.3's
  authorization primitives (`requirePermission()`) correctly evaluate every one of these 27
  permissions today; what's inert is the _execution pipeline_ several of them gate
  (`budget.execute`/`ai.execute`, per `rbac.md` §6), not the permission check itself.
- **Ambiguous-name review (task requirement):** no permission name in the current catalog
  was found ambiguous enough to require renaming. `meta_connection.reconnect` vs.
  `meta_connection.connect` was reviewed for potential overlap — they are distinct actions
  (initial OAuth grant vs. re-authorizing an existing, possibly-expired connection) and the
  existing docs (`clerk-integration.md`-adjacent Meta docs, out of this phase's scope) treat
  them as separate lifecycle events; no change proposed.
- **`campaign.pause`'s worker-invocable classification** was the one genuinely open
  classification in this table — resolved 2026-09-10 by OD-2.4A-03 (amended): a
  scheduled/automated pause rule may originate from a worker (Option 2, "a narrowly-scoped
  guardrail exception"), provided it passes the same deterministic authorization checks any
  other execution path would. **This is a policy ratification only** — no `campaign.pause`
  execution code or automated-guardrail worker exists anywhere in this codebase yet; the
  decision gives whichever future phase builds that feature a settled answer rather than an
  open question. Everything else in this table was resolvable from already-approved
  principles without a new decision.
- No new permission is proposed or added by this document — the 27-permission catalog is
  unchanged; this table's purpose is metadata, not catalog expansion, per the Hard
  Restrictions ("do not add new permissions to production code").
