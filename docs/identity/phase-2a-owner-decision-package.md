# Phase 2A Owner Decision Package

**Document ID:** IDENT-014 | Version 1.1 | Status: CLOSED — Owner Decisions Recorded (2026-09-05) | Phase: 2A (Decision Preparation)

This document packages the 11 unresolved decisions from `phase-2a-decisions.md` §2 for
owner approval/rejection, plus the supporting investigations the governing task requested.

## 0. Closure Record (2026-09-05)

The owner reviewed this package and recorded decisions via the "Claude Code — Approve
Phase 2A Identity Decisions" instruction, referencing documentation commit
`3f054bfe761f54e00f9a904d0a9a4d0929307be4` and GitHub Actions run `33961969827`. All
decisions below are now **ACCEPTED** or **DEFERRED** as recorded in §1/§2/§3 — none remain
"proposed."

**Numbering reconciliation.** The owner's closure message numbered its decisions OD-01
through OD-11 in a different grouping than this document's original OD-01–OD-11 (set at
authoring time, before the owner's message existed, and already referenced by
`phase-2-implementation-sequence.md`). To avoid silently reinterpreting either document,
**this document's original OD-01–OD-11 IDs remain canonical**, and the owner's message is
mapped onto them below rather than renumbered:

| Owner's message ID | Owner's topic                   | Resolves (this package's ID)                                                                                                                                                                              |
| ------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-01              | Clerk (provider scope)          | Reconfirms Clerk selection (ADR-002); resolves **OD-01** (plan/tier) by direct technical implication of accepting OD-04/MFA below                                                                         |
| OD-02              | Clerk Organization ↔ Workspace  | **OD-02**                                                                                                                                                                                                 |
| OD-03              | Workspace Lifecycle             | Extends **OD-08** (owner invariant) with an audited-deletion requirement; this document's original OD-03 (`APPROVER` role vs. permission) is resolved separately below via the Role Model acceptance      |
| OD-04              | MFA                             | **OD-06**                                                                                                                                                                                                 |
| OD-05              | Membership Permission Overrides | **OD-05**                                                                                                                                                                                                 |
| OD-06              | PostgreSQL RLS                  | **OD-04**                                                                                                                                                                                                 |
| OD-07              | Active Workspace                | **OD-11** (storage mechanism) and refines `workspace-model.md` §3's resolution chain                                                                                                                      |
| OD-08              | Owner Invariant                 | **OD-08**                                                                                                                                                                                                 |
| OD-09              | Identity Synchronization        | Accepts the reconciliation-frequency recommendation from §7 (Supporting Investigation); this document's original **OD-09** (exact Clerk event name) is a distinct, still-open procedural item, unaffected |
| OD-10              | AI Authorization                | Reconfirms the AI security boundary — already "Required/non-negotiable" in `phase-2a-decisions.md` §1, not one of the original 11 opens; recorded as formally closed in §5                                |
| OD-11              | Worker Authorization Context    | Accepts the field set from §6 (Supporting Investigation); not one of the original 11 opens; recorded as formally closed in §6                                                                             |

Also accepted in the closure message, outside the OD-01–11 set: the **Role Model**
(`OWNER/ADMIN/MANAGER/ANALYST/VIEWER`, no separate `APPROVER` role — resolving this
document's OD-03) and the **Authorization Contract** (the five `requireXxx()` primitives).

**Not addressed in the closure message — unaffected, because no owner decision was
required for these in the first place (see each item's own point 12 below):** OD-07
(step-up re-authentication mechanism — still deferred to Phase 2 implementation-time
verification) and OD-10 (real-time membership-revocation propagation — recommendation
stands, next-request-only). OD-09's exact-event-name sub-item is likewise still deferred to
implementation time, distinct from the reconciliation-frequency sub-item, which is now
accepted (see OD-09 below).

## 1. Decision Table

| ID    | Decision                                    | Recommended                                                                                                 | Owner Decision (2026-09-05)                                                                                                                                                                              |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-01 | Clerk plan/tier                             | Free tier for Phase 2 (MFA deferred — see OD-06)                                                            | **ACCEPTED — Pro tier (or higher)**, as a direct consequence of accepting OD-06 (MFA required for OWNER/ADMIN; free tier has no MFA)                                                                     |
| OD-02 | Clerk Organization ↔ Workspace mapping      | Option A: Clerk Organization → Application Workspace (1:1)                                                  | **ACCEPTED — Option A**                                                                                                                                                                                  |
| OD-03 | `APPROVER`: role vs. permission             | Permission (`budget.approve`), not a 6th role                                                               | **ACCEPTED — permission-based**, via the owner's Role Model acceptance (§ Role Model, five roles, no `APPROVER`)                                                                                         |
| OD-04 | PostgreSQL Row-Level Security               | **C. Unnecessary as a Phase 2 requirement; revisit as (B) defense-in-depth in Phase 11**                    | **DEFERRED to Phase 11**, as recommended                                                                                                                                                                 |
| OD-05 | Per-membership permission overrides         | Schema placeholder only; do not build the feature                                                           | **DEFERRED** — role-based authorization only for Phase 2, schema extensibility retained                                                                                                                  |
| OD-06 | MFA policy                                  | Require MFA for `OWNER`/`ADMIN` roles and any `budget.approve`/`budget.execute` holder; optional for others | **ACCEPTED**, as recommended — required for OWNER/ADMIN and high-risk financial approval; optional for MANAGER/ANALYST/VIEWER                                                                            |
| OD-07 | Step-up re-authentication mechanism         | Clerk-native re-verification challenge, confirmed at Phase 2 implementation time                            | Not addressed in the closure message — no owner decision was required (see point 12); recommendation stands, mechanism confirmed at Phase 2 implementation time                                          |
| OD-08 | "Never zero owners" invariant mechanism     | Block last-owner removal; require explicit ownership transfer first                                         | **ACCEPTED**, as recommended — implement transactionally; extended by the owner to also require workspace deletion/closure be explicitly authorized and audited                                          |
| OD-09 | Exact Clerk membership-created event name   | Confirm against live Dashboard Event Catalog immediately before webhook implementation                      | Event-name sub-item not addressed — no owner decision was required (see point 12), stands as a pre-implementation check. Reconciliation-frequency sub-item **ACCEPTED — every 30 minutes, configurable** |
| OD-10 | Real-time membership-revocation propagation | Next-request-only (no real-time session termination)                                                        | Not addressed in the closure message — no owner decision was required (see point 12); recommendation stands, next-request-only                                                                           |
| OD-11 | Active-workspace claim storage mechanism    | Clerk session claim (if Option A/OD-02 chosen) or our own server-side record                                | **ACCEPTED** — Clerk organization context, consistent with OD-02's Option A; owner's resolution chain: Clerk user → Clerk org context → application membership → workspace status → authorized workspace |

**Separately, not an owner decision but a blocking engineering finding:** the Next.js
version bump (§5) must happen before Clerk can be installed, regardless of how OD-01–11
are resolved. **Not yet performed** — remains a Hard Restriction under the closure task.

## 2. Detailed Decision Sections

### OD-01 — Clerk Plan/Tier

1. **Decision ID:** OD-01
2. **Current proposal:** Use Clerk's free plan for Phase 2.
3. **Why it matters:** Determines whether real money is committed before any Phase 2 code exists, and whether MFA (a security control referenced in `SEC-003`) is even available.
4. **Security impact:** Free plan has **no MFA** (verified — [Clerk pricing](https://clerk.com/pricing), 2026-09-05: MFA is a Pro-tier feature, ~$25/mo+). If MFA is required (see OD-06), the plan decision and MFA decision are coupled.
5. **Cost impact:** $0/mo on free tier for everything Phase 2 architecturally needs (see the requirement breakdown in §4 below). Pro tier is ~$25/mo+ if MFA is required. Business tier (~$250/mo, admin logs/SOC2) is not needed at this phase.
6. **Engineering impact:** None — the SDK and integration pattern (`clerk-integration.md`) work identically regardless of plan; upgrading later is a Dashboard/billing action, not a code change.
7. **Operational impact:** Free-tier Organizations are capped at limits found inconsistently across two live Clerk sources on the same date (see finding note below) — worth the owner directly confirming current numbers on the live pricing page before any capacity planning.
8. **Recommended option:** Free tier now; revisit only if MFA (OD-06) is approved or the workspace count approaches the free-tier Organization cap.
9. **Alternatives:** Pro ($25/mo+); Business ($250/mo+).
10. **Consequence of each alternative:** Pro adds MFA, passkeys, custom email templates, branding removal, session limits — none required for Phase 2 launch except MFA if OD-06 is approved as "required." Business adds admin logs/SOC2 — relevant only once a compliance requirement exists (none identified anywhere in the SDLC corpus per the Phase 0 assessment).
11. **Blocks Phase 2?** **NON-BLOCKING** — every architectural requirement in this document set works on the free plan.
12. **Exact owner decision required:** Approve free tier for Phase 2 launch, OR pre-approve a Pro-tier spend now if MFA (OD-06) should be mandatory from day one rather than added later.
13. **Owner decision recorded (2026-09-05): ACCEPTED — Pro tier (or higher).** The owner accepted OD-06 (MFA required for OWNER/ADMIN and high-risk financial approval) without qualifying it as deferred; since the free plan has no MFA (item 4 above), Pro tier is a direct technical consequence of that acceptance, not a separate decision made unprompted here.

**Requirement breakdown (as requested):**

| Area                                       | Free plan?                   | Notes                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development requirements                   | ✅                           | Full feature access in development instances per Clerk's own docs (paid features are trialable in dev).                                                                                                                                                                       |
| Production requirements                    | ✅ for everything except MFA | Core auth, sessions, webhooks, Organizations (within limits) all included.                                                                                                                                                                                                    |
| Authentication (sign-in/sign-up, sessions) | ✅                           | Core product, free at any tier.                                                                                                                                                                                                                                               |
| Organization requirements                  | ✅ within free-tier limits   | See MRO/member caps below — this project does not need the "Enhanced B2B" add-on since it does not use Clerk's custom Organization roles (`clerk-integration.md` finding #6; this project's RBAC is application-owned).                                                       |
| MFA requirements                           | ❌                           | Pro-tier only.                                                                                                                                                                                                                                                                |
| Webhook requirements                       | ✅                           | Included at every tier.                                                                                                                                                                                                                                                       |
| Custom roles/permissions requirements      | **Not needed**               | This project explicitly does not use Clerk's Organization role/permission feature (`rbac.md`, `clerk-integration.md` finding #6) — the "Enhanced B2B add-on" required for Clerk custom roles beyond dev mode is therefore irrelevant to this architecture regardless of plan. |

**⚠ Data discrepancy to flag, not resolved here:** two separate live fetches on 2026-09-05
returned different free-tier Organization limits — the Organizations overview page said
"50 MROs in development, 100 in production," while the pricing page said "100 MROs
included per app" with no dev/production split and "up to 20 members per Organization."
Recommend the owner (or whoever sets up the real Clerk account) confirm the current exact
numbers directly on `clerk.com/pricing` at account-creation time rather than trusting
either number transcribed here as final.

---

### OD-02 — Clerk Organization ↔ Workspace Mapping

1. **Decision ID:** OD-02
2. **Current proposal:** Option A — Clerk Organization maps 1:1 to Application Workspace.
3. **Why it matters:** Determines whether Clerk's native Organization UI/webhooks become part of the workspace lifecycle, or whether Workspace exists purely in our own database with Clerk used only for individual identity.
4. **Security impact:** **Identical under both options** — our own `workspace_memberships`/role/permission tables are the sole authorization source either way (`clerk-integration.md` finding #6); Clerk Organization membership is never itself an authorization fact. Tenant isolation, resource authorization, and the IDOR/BOLA rule (`authorization.md` §2) are unaffected by this choice.
5. **Cost impact:** Option A brings the free-tier MRO cap into play (OD-01); Option B has no Organization-related cost ceiling since no Clerk Organizations are created at all.
6. **Engineering impact:** Option A requires the full `identity-sync.md` webhook surface (`organization.*`, `organizationMembership.*`, `organizationInvitation.*`) to be built. Option B needs only `user.*` sync — meaningfully less webhook/reconciliation code for Phase 2.
7. **Operational impact:** Option A gives a Clerk-native organization switcher/invitation UI "for free" (less custom frontend work in Phase 6); Option B requires building 100% of the workspace-switching/invitation UI ourselves, with zero Clerk assistance.
8. **Recommended option:** **Option A** — the reduced Phase 6 frontend work and free MRO headroom (100 orgs, whichever number is confirmed per OD-01) comfortably covers Phase 2–8 scale.
9. **Alternatives:** Option B (Workspace primary, no Clerk Organization at all).
10. **Consequence of each alternative:** Option A: more webhook/sync surface to build and test now, some cost ceiling to watch as the product grows. Option B: less Clerk-dependent code (marginally easier to ever migrate off Clerk later), but 100% custom-built workspace UI and no reduction in `identity-sync.md` scope beyond dropping the `organization.*`/`organizationMembership.*` families — `user.*` sync is still required either way.
11. **Blocks Phase 2?** **OWNER DECISION REQUIRED** but not a hard blocker to _starting_ Phase 2 — the `users` table and `requireAuth()` work identically either way; this decision only needs to land before `identity-sync.md`'s webhook handlers and the `workspaces` table's `clerk_org_id` column are actually implemented.
12. **Exact owner decision required:** Choose Option A or Option B for how (or whether) Clerk Organizations back application Workspaces.
13. **Owner decision recorded (2026-09-05): ACCEPTED — Option A.** Application Workspace remains the authoritative domain entity for resource ownership, application roles/permissions, Meta assets, policies, actions, and audit; Clerk Organization provides identity/membership context only.

**Comparison table (as requested):**

| Dimension            | Option A (Clerk Org → Workspace)                                                                                                | Option B (Workspace primary, Clerk Org optional)                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tenant isolation     | Identical — enforced by our DB either way                                                                                       | Identical                                                                                                     |
| Workspace switching  | Can reuse Clerk's org-switcher session claim                                                                                    | Must build our own switch-context storage entirely                                                            |
| Lifecycle            | Workspace lifecycle partially externally driven (Clerk-side create/delete triggers ours)                                        | Workspace lifecycle 100% ours; Clerk irrelevant to it                                                         |
| Deletion             | Must handle `organization.deleted` webhook + reconciliation                                                                     | No such webhook to handle                                                                                     |
| Membership sync      | Full `organizationMembership.*` surface needed                                                                                  | Not needed at all — memberships are 100% application-managed                                                  |
| Webhook complexity   | Higher (org + membership + invitation families)                                                                                 | Lower (`user.*` only)                                                                                         |
| API authorization    | Unaffected                                                                                                                      | Unaffected                                                                                                    |
| Clerk limits         | MRO cap applies                                                                                                                 | Does not apply                                                                                                |
| Cost                 | Same base plan; MRO overage possible at scale                                                                                   | No Organization-related cost ever                                                                             |
| Future scalability   | Fine up to Clerk's org limits; well-trodden pattern (Slack/Linear-style)                                                        | Fine indefinitely, but more to build/maintain ourselves                                                       |
| Enterprise customers | Clerk Organizations support SSO/domain restrictions natively (paid add-on) — relevant if/when an enterprise customer needs SAML | No native path — would need a custom enterprise-SSO integration entirely outside Clerk's Organization feature |

---

### OD-03 — `APPROVER`: Role vs. Permission

1. **Decision ID:** OD-03
2. **Current proposal:** Model approval capability as the `budget.approve` permission, grantable to any role (in practice OWNER/ADMIN by default per `rbac.md` §3), not as a standalone 6th role.
3. **Why it matters:** Affects whether an agency wanting a client-side "approver only, nothing else" user needs a new role built, or can be served by a role/permission-override combination.
4. **Security impact:** Equivalent either way if implemented correctly; a dedicated role is arguably _clearer_ to audit ("this user is literally an Approver") while a permission is more _composable_.
5. **Cost impact:** None.
6. **Engineering impact:** Reinstating a role means adding a 6th enum value + matrix column now; the permission approach needs no schema change beyond what's already designed.
7. **Operational impact:** A permission-only approach currently has no path to grant `budget.approve` to a MANAGER without also manually managing per-membership overrides (OD-05) — if OD-05 stays "not built," there is today no way to create an "approver-only" user _without_ also being OWNER/ADMIN, which is close to what a dedicated role would give directly.
8. **Recommended option:** Keep permission-based for Phase 2 (simpler now); revisit as a real role only if a concrete customer requirement emerges (agencies with client-side approvers).
9. **Alternatives:** Reinstate `APPROVER` as a 6th distinct role.
10. **Consequence of each alternative:** Adding the role now is speculative build-out for a use case not yet confirmed to exist; deferring it risks a schema/matrix change later if it turns out to be needed sooner than expected — a low-cost deferral either way since roles are a simple enum.
11. **Blocks Phase 2?** NON-BLOCKING.
12. **Exact owner decision required:** Confirm permission-based approach, or request `APPROVER` be reinstated as a distinct role now.
13. **Owner decision recorded (2026-09-05): ACCEPTED — permission-based, no distinct role.** The closure message's Role Model section explicitly accepts only `OWNER/ADMIN/MANAGER/ANALYST/VIEWER` — a five-role set with no `APPROVER` — confirming the permission-based approach as designed.

---

### OD-04 — PostgreSQL Row-Level Security (RLS)

1. **Decision ID:** OD-04
2. **Current proposal:** **C — unnecessary as a Phase 2 requirement.** Application-layer authorization (`authorization.md`) is the mandatory, sufficient control; RLS is optional defense-in-depth that can be added later without changing the application's authorization behavior.
3. **Why it matters:** RLS is a real additional layer against a specific failure mode (a query that skips the application-layer workspace filter due to a coding bug) — but it is not free, and adding it prematurely trades engineering complexity for a benefit the application-layer controls should already fully provide if built correctly.
4. **Security impact:** RLS would catch a _specific_ class of bug (an unscoped query slipping through code review/tests) that the negative-test catalog (`multi-tenancy.md` §4) is also designed to catch. It is not a substitute for getting the application layer right (`DATA-004` §Defense in Depth is explicit that RLS "must not replace" application authorization) — so its marginal security benefit is real but secondary, not primary.
5. **Cost impact:** None directly (RLS is a free Postgres feature), but real engineering time to implement and test correctly.
6. **Engineering impact — the concrete complications the task asked to evaluate:**
   - **Prisma compatibility:** Prisma does not natively manage Postgres RLS policies — they must be created via raw SQL in a migration, and Prisma's query engine must connect using a role/session variable Postgres can evaluate the policy against (typically `SET app.current_workspace_id = '...'` per connection/transaction). This is achievable but is manual, out-of-band-of-Prisma-schema work that must be kept in sync by hand.
   - **Connection pooling:** RLS policies typically depend on a per-connection or per-transaction session variable. With a connection pool (which this project's Postgres access will use), that variable must be **reset or re-set on every checkout from the pool** — a connection reused for a different workspace's request without resetting the variable would either fail closed (safe, but breaks the request) or, worse, silently apply the wrong workspace's policy if the reset step is missed. This is a real operational sharp edge, not a solved problem by default in most ORMs including Prisma.
   - **Transaction context:** the session variable must be set _within_ the same transaction/connection as the actual query for the policy to apply correctly — an easy-to-get-subtly-wrong pattern under concurrent load.
   - **Workers:** background workers would need the identical session-variable-setting discipline as the API — another surface to get right, doubling the places this pattern must be correctly implemented.
   - **Migrations:** RLS policies are schema objects and need their own migration discipline (`DATA_MIGRATIONS.md`'s versioned-migration rules apply to them too), separate from Prisma's own model-driven migrations.
   - **Operational complexity:** debugging "why did this query return zero rows" becomes harder with an added invisible policy layer on top of the visible `WHERE` clause the application code already has.
7. **Tenant escape risk with vs. without RLS:** Without RLS, tenant escape risk is entirely a function of code-review/testing rigor on the application layer — the risk is real but is the _same_ risk every SDLC document already assumes must be controlled (`DATA-004`, `SEC-005`, this document set's own threat model #2). With RLS added but its connection-pooling/session-variable discipline done wrong, RLS can create a **false sense of security** while not actually preventing the escape (or, in the fail-closed case, cause unrelated availability problems) — meaning a _poorly implemented_ RLS layer is not strictly better than no RLS layer, only a _correctly implemented_ one is.
8. **Recommended option:** **C for now** (rely entirely on the application-layer controls already mandated), revisit as **B** (defense-in-depth) in Phase 11 (Reliability & Security Hardening) once the connection-pooling/session-variable pattern can be designed and tested properly, with dedicated time rather than being squeezed into Phase 2's foundation work.
9. **Alternatives:** A (required now).
10. **Consequence of choosing A now:** Phase 2 would need to also solve the connection-pooling/transaction-context problem above _before_ any identity/workspace code ships, materially expanding Phase 2's scope for a defense-in-depth layer whose primary control (application-layer authorization) is already mandatory and independently sufficient if correct.
11. **Blocks Phase 2?** NON-BLOCKING either way — this is a "when," not "whether ever," question, and "not now" does not weaken any Phase 2 requirement.
12. **Exact owner decision required:** Confirm deferring RLS to Phase 11, or explicitly require it be designed and implemented as part of Phase 2 despite the added scope described above.
13. **Owner decision recorded (2026-09-05): DEFERRED to Phase 11.** Application-level tenant isolation and resource authorization remain mandatory in Phase 2 and are never replaced by RLS, as recommended.

---

### OD-05 — Per-Membership Permission Overrides

1. **Decision ID:** OD-05
2. **Current proposal:** Include the `membership_permission_overrides` table in the schema design (already done, unpopulated — `identity-data-model.md` §2) but do not build the feature (no code reads or writes it) in Phase 2.
3. **Why it matters:** Determines whether a workspace can grant/revoke individual permissions to a specific member beyond their role's defaults (e.g., one MANAGER who can also approve budgets, without promoting them to ADMIN).
4. **Security impact — complexity/auditability/privilege-escalation analysis (as requested):**
   - **Complexity:** every authorization check becomes "role default, then check for an override" instead of a single role lookup — doubles the code paths to test and reason about for every single permission check in the system, not just the ones actually using overrides.
   - **Security:** overrides are a classic **privilege-escalation surface** if the permission to _grant an override_ is itself not tightly scoped — e.g., if any ADMIN can silently grant any permission (including `budget.execute`) to any member via an override, that's a second, less-visible path to the same privileges a role change would give, and it's easy to under-audit ("why does this VIEWER have budget.execute" is a much less obvious question to ask than "why is this user an ADMIN").
   - **Auditability:** overrides need their own audit trail (who granted/revoked which override, when, why) on top of the existing role-change audit requirement (`AUDIT_LOGGING.md`) — genuinely more to build and more to review during any security assessment.
   - **Privilege escalation:** the specific risk is a workspace member with `members.update` (which does not itself include the ability to grant overrides in the current design) being mistakenly allowed to grant themselves or an ally an override — the permission to manage overrides must be its own tightly-scoped capability, not bundled into general member management, if this feature is ever built.
5. **Cost impact:** None directly; engineering time only.
6. **Engineering impact:** Meaningful — a real feature with its own UI, audit, and test surface, not a small addition.
7. **Operational impact:** Support/debugging burden increases ("why can this user do X" requires checking two places instead of one) unless overrides are rare in practice.
8. **Future enterprise requirements:** overrides are a genuinely common enterprise ask (custom per-user grants beyond a fixed role) — likely worth having the schema ready for, which is exactly why the placeholder table exists now, without paying the full complexity cost until real demand is confirmed.
9. **Recommended option:** Schema placeholder only, unpopulated, until real customer demand is confirmed.
10. **Consequence of building it now instead:** Meaningfully more Phase 2 scope (feature + audit + tests + the tighter-scoped "who can grant overrides" sub-permission this analysis surfaces as a prerequisite) for a capability with no confirmed current demand.
11. **Blocks Phase 2?** NON-BLOCKING.
12. **Exact owner decision required:** Confirm deferring the feature (schema-only for now), or request it be built as part of Phase 2.
13. **Owner decision recorded (2026-09-05): DEFERRED.** Role-based authorization only for Phase 2 (`Membership → Role → RolePermissions`); `membership_permission_overrides` stays an unpopulated schema placeholder for future enterprise requirements, as recommended.

---

### OD-06 — MFA Policy

1. **Decision ID:** OD-06
2. **Current proposal:** Require MFA for the `OWNER` and `ADMIN` roles, and for any membership holding `budget.approve` or `budget.execute` (regardless of role, accounting for OD-03/OD-05's composability), given these are exactly the roles/permissions with the most damaging blast radius if the account is compromised. `MANAGER`/`ANALYST`/`VIEWER` without financial permissions: MFA optional (user's own choice), not required.
3. **Why it matters:** `SEC-003` explicitly leaves MFA policy as "optional/required according to risk tier" without defining the tiers — this decision defines them, and has a direct cost consequence via OD-01 (MFA is Pro-tier only).
4. **Security impact — role-by-role reasoning (as requested):**
   - **OWNER:** controls workspace deletion, ownership transfer, and every other permission — the single highest-value account to protect. **Require.**
   - **ADMIN:** full operational control including, per the correction in §1 of this document, financial approval/execution. **Require.**
   - **MANAGER:** can create/update/pause campaigns and use AI chat/propose, but (per the current matrix) cannot approve or execute budgets, delete campaigns, or manage members — real but bounded blast radius. **Optional**, unless the MANAGER also happens to hold a `budget.approve` override (if OD-05 is ever built) or is otherwise elevated.
   - **ANALYST/VIEWER:** read-only, no mutation capability at all — lowest blast radius. **Optional.**
   - **Future autonomous actions (Phase 9):** whatever role/permission ultimately triggers or approves autonomous optimization execution should be added to the "MFA required" set at that time — this document does not resolve Phase 9 policy, only flags the connection.
5. **Cost impact:** Requiring MFA for any role means the Pro plan (~$25/mo+, OD-01) is needed, not optional.
6. **Engineering impact:** MFA enforcement itself is Clerk-native (no custom code to build the MFA challenge), but **enforcing "required for these specific roles"** is application logic — Clerk does not know about our application roles, so a step-up/enrollment-requirement check tied to role must be built at the point role is granted or at login, a Phase 2 implementation detail not resolved further here.
7. **Operational impact:** Support burden for MFA-locked-out users (recovery flows) — Clerk-native, but still a real support-process consideration for whoever operates the account.
8. **Recommended option:** As stated in item 2 — risk-tiered by blast radius, coupled to the financial permission set rather than role name alone (so the policy stays correct even if OD-03/OD-05 change who holds `budget.*`).
9. **Alternatives:** No MFA requirement at all (defer entirely); MFA required for all roles regardless of permission.
10. **Consequence of each alternative:** No requirement at all leaves the highest-value accounts (workspace owners, financial approvers) with only password/session security — a real gap given `SEC-002`'s own threat model rates "account takeover" and "compromised user account" as Critical-impact threats. Requiring it for all roles adds friction for read-only users with no corresponding risk reduction, and is a broader Pro-tier cost commitment with no security benefit over the risk-tiered approach for those specific accounts.
11. **Blocks Phase 2?** **OWNER DECISION REQUIRED** given the direct cost coupling to OD-01, but not a hard blocker to writing Phase 2 authentication code — the code path is the same whether the _policy_ says "required" or "optional" for a given role; only the enforcement trigger's configuration changes.
12. **Exact owner decision required:** Approve the risk-tiered MFA policy (and the associated Pro-tier cost via OD-01), or specify a different policy.
13. **Owner decision recorded (2026-09-05): ACCEPTED, as recommended.** MFA required for `OWNER`, `ADMIN`, and high-risk financial approval; optional initially for `MANAGER`/`ANALYST`/`VIEWER`. High-risk financial operations must additionally support step-up authentication before final approval/execution (see OD-07 for the mechanism, still deferred). **Not to be implemented during Phase 2A** — this is a Phase 2 implementation task.

---

### OD-07 — Step-Up Re-Authentication Mechanism

1. **Decision ID:** OD-07
2. **Current proposal:** Use a Clerk-native re-verification challenge (exact API to be confirmed at Phase 2 implementation time — not verified in the Phase 2A research pass) rather than building a custom re-authentication flow.
3. **Why it matters:** `SEC-003` requires step-up for security-setting changes, Meta connect/disconnect, financial-limit changes, high-risk approvals, and emergency-stop administration.
4. **Security impact:** A Clerk-native mechanism benefits from Clerk's own security review/maintenance; a custom-built one is more code this project must independently secure and maintain.
5. **Cost impact:** None expected beyond the base plan, pending Phase 2-time verification.
6. **Engineering impact:** Clerk-native is less code to write and maintain than a custom flow.
7. **Operational impact:** Consistent UX with Clerk's other auth flows (sign-in, MFA) rather than a bespoke pattern users must learn separately.
8. **Recommended option:** Clerk-native, confirmed against current documentation immediately before Phase 2 implementation of this specific feature.
9. **Alternatives:** Custom application-built step-up flow.
10. **Consequence of choosing custom instead:** More code to build, secure, and maintain, for a problem Clerk likely already solves natively — recommended only if Phase 2-time verification finds Clerk's native option doesn't fit a specific requirement.
11. **Blocks Phase 2?** NON-BLOCKING — this is an implementation-detail decision deferred to Phase 2 itself, not something that needs resolving in this architecture-decision pass.
12. **Exact owner decision required:** None required now; flagged so it isn't lost — Phase 2 implementer should verify Clerk's current step-up API before building anything custom.
13. **Owner decision recorded (2026-09-05):** Not addressed in the closure message — consistent with point 12, none was required. The closure message reconfirms step-up is required for high-risk financial operations (see OD-06) without specifying the mechanism; this item's recommendation (Clerk-native, confirmed at implementation time) stands unchanged.

---

### OD-08 — "Never Zero Owners" Invariant Mechanism

1. **Decision ID:** OD-08
2. **Current proposal:** Block removal/role-downgrade of a workspace's last remaining `OWNER`; require an explicit ownership-transfer action (which atomically makes someone else `OWNER` first) before the original owner can step down or be removed.
3. **Why it matters:** Without this, a workspace could end up with no one able to perform `workspace.delete`, `members.remove` at the top level, or ownership transfer itself — an unrecoverable-without-support-intervention state.
4. **Security impact:** Prevents an accidental or malicious "lock everyone out of top-level control" state; the alternative (allowing zero owners) creates a real support/recovery burden and a potential denial-of-service against the workspace's own administration.
5. **Cost impact:** None.
6. **Engineering impact:** A single additional check in the membership-removal/role-change code path (`identity-api-contracts.md`'s `DELETE /workspaces/:id/members/:membershipId` and `PATCH .../:membershipId` endpoints) — small, well-contained.
7. **Operational impact:** Clear, deterministic error message on the blocked action rather than an ambiguous failure; no support process needed since the block itself prevents the bad state.
8. **Recommended option:** Block-and-require-transfer, as proposed.
9. **Alternatives:** Allow a zero-owner state and rely on a support/recovery process to fix it after the fact.
10. **Consequence of the alternative:** Requires building a support/recovery process (manual database intervention or a support-tool feature) for a state that's straightforward to prevent outright — strictly more total work for a worse outcome.
11. **Blocks Phase 2?** NON-BLOCKING — a small, uncontroversial implementation detail.
12. **Exact owner decision required:** None required; recommendation stands unless the owner sees a specific reason to prefer the alternative.
13. **Owner decision recorded (2026-09-05): ACCEPTED, as recommended — implement transactionally.** Owner removal is allowed only when another active owner exists or an explicit ownership transfer is completed. **Extended by the owner (closure message's "Workspace Lifecycle" item):** workspace deletion/closure must additionally be explicitly authorized and audited, and the application must never silently orphan a workspace — both Clerk organization lifecycle and application workspace lifecycle are maintained together (see `workspace-model.md` §5, to be annotated at Phase 2 implementation time).

---

### OD-09 — Exact Clerk Membership-Created Event Name

1. **Decision ID:** OD-09
2. **Current proposal:** Confirm the exact event name against the live Clerk Dashboard's Event Catalog immediately before the Phase 2 webhook handler for membership creation is written — not guessed from documentation pattern alone (`clerk-integration.md` finding #8 already flags this).
3. **Why it matters:** Getting this wrong means the webhook handler silently never fires for new memberships.
4. **Security impact:** None directly — this is a functional-correctness question. **The reconciliation pass (`identity-sync.md` §4) is the safety net** if the event name is ever wrong or the event is missed for any reason, so there is no security gap even if this specific event name turns out to be mis-guessed initially.
5. **Cost impact:** None.
6. **Engineering impact:** Trivial to confirm (one look at the Dashboard) but easy to skip/forget — called out explicitly so it isn't lost.
7. **Operational impact:** None beyond the reconciliation pass already covering the failure mode.
8. **Recommended option:** As proposed — confirm at implementation time, not now (no Clerk account exists yet to check against).
9. **Alternatives:** Guess now from the naming pattern of the other confirmed events and adjust later if wrong.
10. **Consequence of guessing now:** No real downside given the reconciliation backstop, but no benefit either since a real Clerk account will need to exist before this can actually be verified — deferring the confirmation costs nothing.
11. **Blocks Phase 2?** NON-BLOCKING.
12. **Exact owner decision required:** None — procedural note for the Phase 2 implementer.
13. **Owner decision recorded (2026-09-05):** The exact-event-name sub-item was not addressed — consistent with point 12, none was required; it remains a pre-implementation Dashboard check. **A related but distinct sub-item — reconciliation frequency (§7 below) — was explicitly ACCEPTED: every 30 minutes, configurable**, closing the one open gap in `identity-sync.md` §4.

---

### OD-10 — Real-Time Membership-Revocation Propagation

1. **Decision ID:** OD-10
2. **Current proposal:** Next-request-only revocation (no forced real-time session termination or push-based invalidation) — since every request already re-checks membership (`identity-architecture.md` §1), a revoked user is denied on their very next action regardless.
3. **Why it matters:** Determines whether a revoked member can still, e.g., watch a live-updating dashboard for some window of time after revocation (if such a feature exists) before their next discrete request is denied.
4. **Security impact:** Low residual risk — the _only_ gap is a request already in flight at the exact moment of revocation, or a hypothetical long-lived streaming connection that doesn't re-check per "request" in the traditional sense (no such feature exists yet in this architecture).
5. **Cost impact:** None either way.
6. **Engineering impact:** Real-time propagation requires either a push mechanism (websocket/SSE invalidation signal) or a session-cache-busting mechanism — real additional infrastructure for a marginal risk reduction given the next-request-only behavior already denies access almost immediately in practice.
7. **Operational impact:** Real-time propagation adds a new failure mode of its own (the invalidation signal itself failing to deliver) — trading one small residual risk for a different, new one.
8. **Recommended option:** Next-request-only for Phase 2; revisit only if a genuine long-lived-connection feature (e.g., a live chat/notification stream) is added later that wouldn't naturally re-check membership per message.
9. **Alternatives:** Real-time forced session/session-cache invalidation on revocation.
10. **Consequence of building real-time now:** Meaningful infrastructure (push mechanism) for a risk window measured in the time between two ordinary HTTP requests — disproportionate for Phase 2.
11. **Blocks Phase 2?** NON-BLOCKING.
12. **Exact owner decision required:** None required; recommendation stands.
13. **Owner decision recorded (2026-09-05):** Not addressed in the closure message — consistent with point 12, none was required. Recommendation stands unchanged: next-request-only revocation.

---

### OD-11 — Active-Workspace Claim Storage Mechanism

1. **Decision ID:** OD-11
2. **Current proposal:** If Option A (OD-02) is chosen, use Clerk's own "active organization" session claim; if Option B, use our own server-side record (e.g., a row or cache entry keyed by user, holding the last-verified active workspace).
3. **Why it matters:** Purely an implementation-detail question of _where_ the claimed-but-always-re-verified active workspace value lives between requests.
4. **Security impact:** Identical either way — `workspace-model.md` §3/§4 requires `requireMembership()` re-verification regardless of where the claim is stored; the storage location is never itself trusted as authorization.
5. **Cost impact:** None.
6. **Engineering impact:** Reusing Clerk's own session claim (Option A world) means one less piece of server-side state to build/maintain; a custom record (Option B world, or Option A if preferred anyway) is more code but keeps the mechanism independent of Clerk.
7. **Operational impact:** Negligible either way.
8. **Recommended option:** Follow whichever OD-02 option is chosen — Clerk session claim under Option A, our own record under Option B — rather than building a parallel mechanism to what OD-02 already implies.
9. **Alternatives:** The other storage mechanism, regardless of OD-02's outcome (e.g., our own record even under Option A).
10. **Consequence of the alternative:** Building our own record even when Clerk's native claim (Option A) is available is pure duplicated engineering effort with no corresponding benefit, since both are re-verified identically.
11. **Blocks Phase 2?** NON-BLOCKING — resolves itself once OD-02 is decided.
12. **Exact owner decision required:** None beyond OD-02 itself.
13. **Owner decision recorded (2026-09-05): ACCEPTED — Clerk organization context.** Consistent with OD-02's Option A, the owner's specified active-workspace resolution chain (§ Active Workspace below) is: `Authenticated Clerk user → Clerk organization context → Application membership → Workspace status → Authorized workspace`. This refines, rather than replaces, `workspace-model.md` §3's resolution flow — `requireMembership()` still re-verifies against our database on every request; the Clerk organization context is never itself authorization-sufficient.

## Additional Closure Items (outside the original OD-01–11 set)

### Active Workspace (owner closure message, distinct from OD-11's storage question)

The owner formalized the active-workspace **resolution chain** itself (not just where the
claim is stored): `Authenticated Clerk user → Clerk organization context → Application
membership → Workspace status → Authorized workspace`. The client may request a workspace
context, but the server must validate every step; a client-supplied workspace ID is never
trusted without this chain running in full. **ACCEPTED** — consistent with, and a
refinement of, `workspace-model.md` §3/§4.

### AI Authorization (owner closure message's OD-10)

Not one of the original 11 open decisions — the AI security boundary was already
"Required/non-negotiable" per `phase-2a-decisions.md` §1 (`ADR-002-AI-EXECUTION-BOUNDARY`).
The owner's closure message reconfirms it explicitly: AI has no standing authorization;
every AI tool call re-evaluates the full chain (Authenticated User → Workspace Membership →
Permission → Resource Authorization → Action Policy → Financial Policy → Approval); the AI
must never select or expand workspace scope. This matches the verification already recorded
in §5 below. **ACCEPTED (reconfirmed, no design change).**

### Worker Authorization Context (owner closure message's OD-11)

Not one of the original 11 open decisions — this is the field set investigated in §6 below
per the governing task's item 8. The owner's closure message accepts it explicitly:
privileged jobs must carry `workspaceId`, `initiatingUserId` (or actor identity),
resource scope, action scope, `correlationId`, and `jobId`, as applicable; workers must
never accept arbitrary client-controlled authorization context. **ACCEPTED**, matching §6's
analysis, with `jobId` named explicitly by the owner alongside the fields already
identified there.

### Role Model (owner closure message)

`OWNER/ADMIN/MANAGER/ANALYST/VIEWER` **ACCEPTED** as the application-owned role model;
Clerk's Organization roles are confirmed not used as the application's authorization
source. Financial permissions remain separate from general campaign-management permissions
(the Financial Separation Rule, `rbac.md` §4). This also resolves OD-03 (`APPROVER`) — see
above.

### Authorization Contract (owner closure message)

The five primitives (`requireAuth() → requireWorkspace() → requireMembership() →
requirePermission() → requireResourceAccess()`) **ACCEPTED** as the mandatory chain for
every protected API/resource operation, with non-disclosing `404` behavior preferred for
cross-workspace resource access where appropriate — matching `authorization.md` §1/§3
exactly, no design change.

## 3. Owner Decision Recording

| ID    | Owner decision                                                                                                                | Date       | Notes                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| OD-01 | **ACCEPTED** — Pro tier (or higher)                                                                                           | 2026-09-05 | Direct consequence of OD-06 acceptance (free tier has no MFA)          |
| OD-02 | **ACCEPTED** — Option A (Clerk Organization ↔ Workspace, 1:1)                                                                 | 2026-09-05 | Application Workspace remains authoritative                            |
| OD-03 | **ACCEPTED** — permission-based, no distinct `APPROVER` role                                                                  | 2026-09-05 | Via Role Model acceptance                                              |
| OD-04 | **DEFERRED** — to Phase 11                                                                                                    | 2026-09-05 | Application-layer isolation remains mandatory in Phase 2               |
| OD-05 | **DEFERRED** — role-based only for Phase 2                                                                                    | 2026-09-05 | Schema extensibility retained                                          |
| OD-06 | **ACCEPTED** — risk-tiered (OWNER/ADMIN/high-risk financial: required; others: optional)                                      | 2026-09-05 | Not implemented in Phase 2A                                            |
| OD-07 | Not addressed — no decision required                                                                                          | —          | Recommendation (Clerk-native, confirmed at implementation time) stands |
| OD-08 | **ACCEPTED**, extended with audited-deletion requirement                                                                      | 2026-09-05 | Implement transactionally in Phase 2                                   |
| OD-09 | Event name: not addressed (stands as pre-implementation check). Reconciliation frequency: **ACCEPTED** — 30 min, configurable | 2026-09-05 | Two distinct sub-items                                                 |
| OD-10 | Not addressed — no decision required                                                                                          | —          | Recommendation (next-request-only) stands                              |
| OD-11 | **ACCEPTED** — Clerk organization context                                                                                     | 2026-09-05 | Consistent with OD-02                                                  |

## 4. Supporting Investigation — Application Roles Review (task §6)

Reviewed the full `rbac.md` §3 permission matrix for unintended privilege expansion, with
special attention to AI, financial actions, Meta connections, member management, and
workspace deletion.

**Found and corrected:** `rbac.md` §2's role-semantics prose for `ADMIN` stated ADMIN does
"not implicitly gain `budget.approve`/`budget.execute`," directly contradicting §3's actual
permission matrix, which grants both to `ADMIN`. This was an internal documentation
inconsistency (not a new policy decision) and has been corrected in `rbac.md` to match the
matrix — **ADMIN does hold `budget.approve`/`budget.execute`**, consistent with "full
operational control." This correction is the reason OD-06's MFA recommendation explicitly
includes `ADMIN` alongside `OWNER` in the "require MFA" tier.

**No other unintended expansion found:**

- AI: `ai.execute` correctly withheld from `MANAGER` (only `OWNER`/`ADMIN`) even though `MANAGER` holds `campaign.update` — consistent with the financial-separation-style caution already designed for budget permissions.
- Meta connections: connect/reconnect/disconnect correctly withheld from `MANAGER`/`ANALYST`/`VIEWER`.
- Member management: invite/update/remove correctly withheld from `MANAGER`/`ANALYST`/`VIEWER`.
- Workspace deletion: correctly restricted to `OWNER` only (not even `ADMIN`).

## 5. Supporting Investigation — AI Permissions Independence (task §7)

Verified that `ai.chat`/`ai.read`/`ai.propose`/`ai.execute` **cannot, by themselves, grant
access to any resource.** Mechanism: per `authorization.md` §6, an AI tool call runs the
_entire_ primitive chain for the specific resource/operation the tool touches — an `ai.*`
permission only gates whether the AI _feature itself_ is reachable at all (i.e., "can this
user use chat/propose/execute-via-AI"), never substituting for the resource-specific
permission (`campaign.read`, `budget.execute`, etc.) the underlying tool call still
independently requires via `requirePermission()` + `requireResourceAccess()`. A user
holding `ai.execute` but not `budget.execute` still cannot have the AI execute a budget
change — the tool call's own `requirePermission(budget.execute)` check denies it exactly
as it would a direct API call. **Recommendation, not implemented this phase:** when
`authorization.md` is next revised (a Phase 2 implementation-time task, out of this
document's scope), make this "two independent checks" structure explicit in its own
diagram rather than implied — flagged here so it is not lost, not corrected in this pass
since the governing task's Required Documentation list does not include editing
`authorization.md`.

## 6. Supporting Investigation — Worker Authorization Fields (task §8)

| Field                   | Mandatory?                                       | Reasoning                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`           | **Always mandatory**                             | No tenant isolation is possible without it (`DATA-004` rule #5).                                                                                                                                                                                                                                                                                                                                    |
| `initiatingUserId`      | **Mandatory in one of two forms**                | A real user ID for user-triggered jobs; an explicit system-actor identity (e.g. `actor_type: "system"`) for scheduled/system-initiated jobs (periodic reconciliation, scheduled optimization scans). Never silently absent — every job is attributable to _something_.                                                                                                                              |
| `resourceId`            | **Mandatory when the job is resource-scoped**    | A job like "sync this ad account" must carry the ad account's ID; a workspace-wide job (e.g. "reconcile all memberships for workspace X") has no single resource ID and is scoped by `workspaceId` alone.                                                                                                                                                                                           |
| "authorization context" | **Not a separate field**                         | Per `authorization.md` §4, the worker never trusts a cached authorization decision from enqueue time — it re-derives authorization fresh at execution time using the same `requireResourceAccess()`-shaped check any other caller uses, given `workspaceId` + actor + `resourceId`. "Authorization context" is the _outcome_ of having those three fields correct, not a fourth field to serialize. |
| `correlationId`         | **Always mandatory (operational, not security)** | Reuses this project's existing Phase 1 Foundation request-ID correlation pattern (`packages/config`'s `REQUEST_ID_HEADER`/`generateRequestId`) so every job is traceable back to the request/event that caused it, per `API_OBSERVABILITY.md`.                                                                                                                                                      |

## 7. Supporting Investigation — Identity Sync Assumptions (task §9)

| Assumption Clerk cannot guarantee | Design response (already in `identity-sync.md`)                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate events                  | Event-ID-keyed idempotency (§2 step 6)                                                                                                                                                       |
| Missing events                    | Periodic reconciliation backstop (§4)                                                                                                                                                        |
| Out-of-order events               | Timestamp-based conflict resolution + bounded-deferral tolerance for out-of-order parent/child events (§3)                                                                                   |
| Deleted users                     | Non-blind-delete handling preserving audit attribution (§5)                                                                                                                                  |
| Deleted organizations             | Mark-inactive, not hard-delete, preserving audit history (§1 `organization.deleted` row)                                                                                                     |
| Revoked memberships               | Next-request re-check (OD-10), not real-time propagation                                                                                                                                     |
| Webhook replay                    | Signature verification + event-ID idempotency together — a replayed, validly-signed old event is a no-op (§2, threat #14 in `identity-threat-model.md`)                                      |
| Reconciliation frequency          | **ACCEPTED (2026-09-05): every 30 minutes**, configurable — mirrors the cadence order-of-magnitude reasonable for identity data, which changes far less often than Meta ad performance data. |

## 8. Next.js Upgrade Recommendation

See `phase-2-implementation-sequence.md` §1 for the full investigation (current version,
compatibility, breaking-change review, verification plan). Summary: **target `next@15.5.9`**
— the highest Next.js 15.x line explicitly validated by Clerk's own peer-dependency range,
staying within the currently-selected major version (not jumping to Next.js 16, whose
latest is `16.3.4` as of this verification). No upgrade performed in this phase.

## 9. STOP — Phase 2A Closed, Phase 2 Implementation Not Yet Authorized

All owner decisions above are recorded as ACCEPTED or DEFERRED. This closes the Phase 2A
owner-decision gate (`phase-2a-gate-checklist.md`). Per the closure task's explicit Hard
Restrictions, **no code, dependency, migration, or configuration change was made while
recording these decisions** — Next.js has not been upgraded, Clerk has not been installed,
no workspace/RBAC tables exist, and no authentication/authorization/Meta/AI/financial code
has been written. Phase 2 implementation begins only on a separate, explicit go-ahead.
