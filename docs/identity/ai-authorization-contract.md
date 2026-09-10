# AI Authorization Contract

**Document ID:** IDENT-018 | Version 1.0 | Status: Approved (Owner Decision — see `phase-2-4a-decisions.md`) | Phase: 2.4A (Architecture Finalization)

Formalizes `authorization.md` §6 and §10 into a complete, implementation-ready contract for
every future AI tool call. **No AI tool is implemented by this document** — Phase 2.4A is
architecture only, per the Hard Restrictions. This document exists so whichever phase
implements AI tools does not re-derive this design.

## 1. The Non-Negotiable Principle (restated, not re-decided)

> The model may reason and request tools, but deterministic application services remain
> authoritative for: identity, authorization, tenant scope, policy, financial limits,
> approval, external execution, verification.
> — `AI_ARCHITECTURE.md` §2, "AI Is Not the Security Boundary"

> AI requests inherit the initiating user's authorized workspace context. The client cannot
> expand that context by modifying request fields.
> — `AUTHORIZATION_MODEL.md`

**The AI model never holds a credential, a permission, a role, or a workspace selection of
its own.** Every tool call is authorized as if the initiating human had called the
equivalent API endpoint directly — because internally, it does (`authorization.md` §6).

## 2. The Formal Tool Invocation Record

Every AI tool invocation, once implemented, must be representable as a record with exactly
these fields — merging `AI_TOOL_CONTRACT.md`'s list and `AI_ARCHITECTURE.md` §5's list (the
existing corpus defines two overlapping but not identical field sets; this is the single
canonical merge):

| Field                   | Source of truth                                                                                                                                                                                             | Never derived from                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `actorIdentity`         | The verified Clerk session's `User` row, resolved via `requireAuth()` — same as any human API caller.                                                                                                       | A model-generated "user_id" field, a chat message, a prior turn's cached identity.              |
| `workspaceContext`      | `resolveActiveWorkspace()`/`requireActiveWorkspace()` — the same server-derived active-workspace chain every human request uses (`workspace-model.md` §3).                                                  | A workspace ID the model mentions, infers from conversation history, or is asked to "remember." |
| `resourceContext`       | Resolved via `requireResourceAccess()` against the authorized workspace, exactly as any other resource lookup (`authorization.md` §2).                                                                      | A resource ID the model asserts exists or belongs to the workspace.                             |
| `requestedAction`       | A typed, schema-validated tool name from a fixed, allowlisted catalog (`AI_SECURITY.md`'s "Tool Security" — allowlisted operations, strict schemas).                                                        | Free-form natural language describing what the model "wants to do."                             |
| `permissionRequirement` | A specific entry from `permission-catalog.md` (dot-style key, e.g. `campaign.update`) that the tool's `requestedAction` maps to 1:1, fixed at tool-definition time, never chosen by the model at call time. | The model's own judgment about what permission "should" be needed.                              |
| `riskClassification`    | `permission-catalog.md`'s Standard/Elevated/High Risk tier for the mapped permission (§2's cross-reference to `SECURITY_ARCHITECTURE.md`'s 3-tier model).                                                   | Anything the model reports about its own confidence or the action's perceived safety.           |
| `approvalRequirement`   | Derived from `riskClassification` + the permission's "Approval-related" column in `permission-catalog.md` — High Risk + financial always requires approval; never optional per-call.                        | The model deciding an action is "safe enough to skip approval."                                 |
| `correlationId`         | Generated server-side at the start of the conversation turn/tool-call chain, propagated through every downstream primitive and audit event (matches `AuditEvent.correlationId`, Phase 2.3).                 | The model, which never sees or generates this value.                                            |

This table is the answer to the task's "define a formal authorization contract" requirement
— it is a specification for future code, not a Zod schema shipped in this phase (no
production code changes in Phase 2.4A).

## 3. The Mandatory Sequence

Every tool call, from proposal to execution, passes through this sequence — no step may be
skipped, reordered, or short-circuited by the model:

```text
User message ("Pause Campaign X")
  ↓
AI reasons, selects a tool from its allowlisted, typed catalog
  ↓
requireAuth()                         — resolve the REAL initiating user, not a model claim
  ↓
requireActiveWorkspace()/
requireWorkspaceMembership()          — the server-resolved active workspace, never a
                                         workspace ID the model mentions
  ↓
requirePermission(membership,
  mappedPermission)                   — e.g. campaign.pause; fails 403 if the human lacks it,
                                         REGARDLESS of what the model believes is appropriate
  ↓
requireResourceAccess(campaign,
  authorizedWorkspaceId)              — Campaign X must actually belong to this workspace;
                                         404 if not, IDENTICAL to a human calling the same
                                         endpoint directly with a wrong campaign ID
  ↓
Action Policy (Phase 9 scope)         — is this specific mutation within configured limits?
  ↓
Approval (Phase 9 scope, if required
  by riskClassification)              — a human approval, bound to this exact action/version
  ↓
Execution                             — only after every prior gate passed
  ↓
Verification (Phase 9 scope)          — confirm the external state actually changed as intended
  ↓
Audit (AuditEvent, Phase 2.3
  infrastructure, already built)      — actorType/actorId = the real human, never "AI";
                                         correlationId ties the whole chain together
```

**The model never sees, and never needs to see, whether any given step passed or failed for
security reasons** — it receives only the eventual outcome (success, or a safe, non-
leaking denial message), exactly as `AI_SECURITY.md`'s "Output Security" and
`authorization.md` §3's 401/403/404 disclosure policy already require for any caller.

## 4. Worked Example — "Pause Campaign X" (the governing task's own example)

1. User (in a chat interface, signed in with a real Clerk session) types: "Pause Campaign X."
2. The AI orchestrator identifies this as a candidate for the (future) `pause_campaign` tool
   and extracts `campaignRef: "Campaign X"` as a proposed argument — this is a **proposal**,
   not yet an authorized action.
3. `requireAuth()` resolves the actual signed-in `User` from the request's verified session
   — never from anything in the chat transcript.
4. `requireActiveWorkspace()` resolves the caller's real active workspace via the same
   server-side chain every non-AI request uses.
5. `requirePermission(membership, "campaign.pause")` checks the _initiating human's_ role
   against `permission-catalog.md`. If they're a VIEWER, this fails `403` **even though the
   AI itself was willing to attempt the call** — the model's willingness is never
   authorization-sufficient.
6. The application resolves "Campaign X" to an actual campaign row and calls
   `requireResourceAccess(campaign, authorizedWorkspaceId)`. If "Campaign X" doesn't exist in
   this workspace (e.g. it exists in a _different_ workspace the model hallucinated into
   scope, or the human typed an ambiguous name resolving to another tenant's campaign by
   coincidence), this fails `404` — indistinguishable from "no such campaign," never
   revealing that a same-named campaign exists elsewhere.
7. Only past all of the above does the request reach Action Policy / Approval (Phase 9,
   not built yet) and finally Execution.
8. The audit trail records the **human's** `actorId`, not "AI," with `metadata` noting the
   request originated via the AI orchestrator (for observability, never as a shortcut around
   authorization).

**If any of steps 3–6 fail, the AI receives a normal tool-call error and must not retry with
different claimed identity/workspace/resource values, escalate its own privileges, or invent
a workaround** — `AI_SECURITY.md`'s "Output Security" and `AGENT_WORKFLOW.md`'s Stop
Conditions ("authorization is insufficient," "policy denies action") both require the agent
to stop, report the denial back to the user in plain language, and take no further action of
its own initiative.

## 5. Explicit Boundaries (What AI Must Never Be Able To Do)

Restated from the governing task, made concrete against this project's actual primitives:

- **Select a workspace.** No tool input field, no conversation memory, no inferred context
  may ever substitute for `resolveActiveWorkspace()`'s server-derived result.
- **Hold a standing or elevated credential.** Every call re-runs the full chain in §3; there
  is no "AI service account," no cached prior-call authorization result reused for a
  subsequent call.
- **Decide whether an action is financially safe.** `budget.propose` is the AI's ceiling —
  see `permission-catalog.md`'s Financial Actions section: `budget.approve`/`budget.execute`
  are marked **Never** AI-invocable, unconditionally, matching `ACTION_APPROVAL_SECURITY.md`'s
  "No Approval Bypass" rule.
- **Modify its own permissions, tools, or policy.** Directly restates
  `AUTONOMOUS_OPTIMIZATION.md`'s "No Self-Modification" principle, generalized from
  autonomous runs to every AI invocation: "the optimizer cannot modify its own permissions,
  financial limits, policies or approval requirements."
- **Execute arbitrary SQL, HTTP, or shell commands.** `AI_SECURITY.md`'s Output Security list
  — every tool is typed and schema-validated; there is no generic "escape hatch" tool.
- **Trust prompt-injected content as instructions.** External content (campaign names, ad
  copy, a user's pasted text) is data the model reasons about, never a source of
  authorization claims or tool arguments taken at face value — matches
  `identity-threat-model.md` threat #12 and `ACCEPTANCE_CRITERIA.md` AC-010.

## 6. Open Item: Autonomous (Non-Human-Initiated) Actions

`AUTONOMOUS_OPTIMIZATION.md`'s pipeline begins from a `Scheduler`, not a human request — this
means an autonomous run has no natural `actorIdentity` for §2's table, unlike every example
above. **This is not resolved by this document** — see `phase-2-4a-decisions.md`'s
`OD-2.4A-01` for the proposed options and recommendation. Nothing in Phase 2.4A implements
autonomous execution (Hard Restrictions explicitly exclude it), so this gap does not block
Phase 2.4 implementation — it blocks whichever future phase builds
`AUTONOMOUS_OPTIMIZATION.md`'s pipeline, and is recorded here so that phase does not have to
rediscover the gap.
