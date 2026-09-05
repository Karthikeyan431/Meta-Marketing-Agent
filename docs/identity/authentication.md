# Authentication

**Document ID:** IDENT-002 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

Scope: what Clerk is responsible for, and the exact behavior required for every
authentication state the application can be in. Session/token security requirements are
carried forward from `SEC-003` (AUTHENTICATION_AND_SESSION.md) and made concrete for Clerk.

## 1. What Clerk Owns vs. What We Own

| Concern                                                                    | Owner                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Password/passkey/OAuth sign-in, MFA challenge, session issuance            | **Clerk**                                                                                         |
| Session cookie security (HttpOnly, Secure, SameSite), rotation, revocation | **Clerk** (verified current implementation before Phase 2 build, per `clerk-integration.md`)      |
| "Is this session currently valid?"                                         | **Clerk** (`auth()`/middleware)                                                                   |
| "Is this user a member of workspace X?"                                    | **Our database**                                                                                  |
| "What may this user do in workspace X?"                                    | **Our database**                                                                                  |
| Step-up re-authentication for sensitive operations                         | **Clerk** triggers the challenge; **our database** still separately re-checks authorization after |

## 2. Authentication States and Required Behavior

| State                                                             | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signed out**                                                    | No session. All non-public routes/resources return `401` (API) or redirect to sign-in (web). No workspace context exists.                                                                                                                                                                                                                                                                                                                                                                                           |
| **Signed in, no workspace**                                       | Valid Clerk session, but the user has zero rows in `workspace_memberships`. Every workspace-scoped request returns `403` (authenticated, but nothing to authorize against — see `authorization.md` §403-vs-404). Web UI routes to an "create or join a workspace" state, never a blank/broken workspace shell.                                                                                                                                                                                                      |
| **Signed in, one workspace**                                      | That workspace becomes the default active workspace (see `workspace-model.md` §Active Workspace Resolution). No workspace-switch UI needed, but the same server-side membership check still runs on every request — the single-workspace case is not special-cased into skipping authorization.                                                                                                                                                                                                                     |
| **Signed in, multiple workspaces**                                | User has an explicit active-workspace selection (see `workspace-model.md`). Every request must re-verify membership in the _currently claimed_ active workspace — a stale or forged active-workspace claim must be re-derived from the server-authoritative session, never trusted from a client-sent header/cookie value alone.                                                                                                                                                                                    |
| **Membership revoked (mid-session)**                              | The user's Clerk session can still be valid, but their `workspace_memberships` row is deleted/deactivated. Because every request re-checks membership (rule #1 in `identity-architecture.md`), the very next request after revocation fails with `403`. There is no "already logged in, so still authorized" grace period. If real-time revocation (mid-request, e.g. via a live socket) becomes a product requirement, that is a Phase 2 implementation decision, not resolved here — see `phase-2a-decisions.md`. |
| **Workspace deleted**                                             | All membership rows, and all workspace-owned resources, are logically gone for authorization purposes immediately (soft-delete semantics per `DATA_ARCHITECTURE.md` §9 do not imply "still accessible"). Every subsequent request scoped to that workspace fails `403`/`404` per `authorization.md`'s enumeration rule. Audit history for the deleted workspace is retained per `DATA_RETENTION.md`/`AUDIT_LOGGING.md` regardless of workspace deletion.                                                            |
| **Clerk user deleted** (`user.deleted` webhook)                   | Our `users` row is not necessarily hard-deleted immediately — see `identity-sync.md` for the exact handling — but the user can no longer authenticate (Clerk has no session for them), and any of their pending approvals/actions must be handled per `identity-sync.md` §User Deletion Handling rather than left silently orphaned.                                                                                                                                                                                |
| **Session expired** (absolute lifetime reached)                   | Clerk rejects the session; the app receives no valid `auth()` context; treated identically to signed-out for authorization purposes.                                                                                                                                                                                                                                                                                                                                                                                |
| **Session revoked** (explicit logout-everywhere, or admin action) | Same as expired — Clerk is the source of truth for session validity; we never cache "this session was valid 5 minutes ago" as a substitute for revalidating per request.                                                                                                                                                                                                                                                                                                                                            |

## 3. Session Security Requirements (per `SEC-003`, applied to Clerk)

- Session identifiers are high-entropy and managed entirely by Clerk — the application
  never generates, parses, or trusts a session token issued by anything other than Clerk.
- HTTPS-only in every environment above local dev; Clerk-issued cookies are `Secure` +
  `HttpOnly`; `SameSite` policy follows Clerk's current default unless a specific
  cross-origin requirement is identified (none exists in this phase).
- Inactivity timeout and absolute session lifetime are configured in the Clerk Dashboard,
  not reimplemented in application code — verify current Clerk session-duration
  configuration options at Phase 2 implementation time (not re-verified in this pass; only
  the middleware/authorization/webhook areas were verified — see `clerk-integration.md`
  §1 for exactly which items were checked).
- Session rotation after a privilege change (e.g., a role change mid-session) is achieved
  by the fact that **every request re-derives permissions from the database**, not from
  anything cached in the session token — a role change takes effect on the very next
  request, without needing to force session invalidation.
- No session or authentication token is ever placed in a URL, query string, or log line.
- Users must be able to view and revoke their own active sessions — this is a Clerk-native
  capability (session management UI/API); exposing it in our product UI is a Phase 2/6
  (Frontend) implementation task, not designed further here.

## 4. Step-Up (Re-)Authentication

Per `SEC-003`, step-up authentication should gate:

- changing security settings
- connecting/disconnecting Meta
- changing financial limits
- approving high-risk actions
- emergency-stop administration

**Design decision for Phase 2A:** step-up is implemented as a Clerk-native
re-authentication challenge (exact mechanism to be confirmed against current Clerk
documentation at Phase 2 implementation time — not verified in this pass) triggered by our
own application code immediately before the sensitive operations listed above, **in
addition to**, never instead of, the normal permission check. A successful step-up proves
"this is really the authenticated human right now"; it does not itself grant a permission
the user's role does not already hold.

## 5. Multi-Factor Authentication

`SEC-003` leaves MFA as "optional/required according to risk tier" without defining the
tiers. **Not resolved in this phase** — recorded as an open decision in
`phase-2a-decisions.md`. Clerk supports MFA natively; the policy question (which roles or
operations require it) is a product/security decision for the owner, not inferable from
existing documents.
