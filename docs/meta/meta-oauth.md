# Meta OAuth Architecture

**Document ID:** META-102 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_OAUTH_FLOW.md` (META-002)
against a live 2026-09-10 verification of Meta's current OAuth documentation and this
project's already-shipped authentication patterns (`docs/identity/authorization.md`,
`docs/identity/workspace-model.md` §3's active-workspace resolution chain). No OAuth code,
route, or credential exists yet — this document specifies the flow for Phase 3.1 to implement.

## 1. Live-Verified Current Meta OAuth Mechanics (2026-09-10)

**Sources:** `developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/`,
`developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived/`
(both directly fetched by this phase's research).

- Authorization dialog: `GET https://www.facebook.com/v25.0/dialog/oauth` with `client_id`,
  `redirect_uri`, `state` (required — Meta's own docs describe this explicitly as the CSRF
  defense, echoed back unchanged on callback), `response_type` (`code` for a server-side flow,
  which this application uses exclusively — never `token` or `code token`), `scope`.
  `auth_type=rerequest` re-prompts for a previously-denied permission.
- Token exchange: `GET https://graph.facebook.com/v25.0/oauth/access_token` with `client_id`,
  `redirect_uri` (must match the original dialog request exactly), `client_secret` (server-side
  only, never sent to or held by the browser), `code` → returns `{access_token, token_type,
expires_in}`.
- Long-lived token exchange: same endpoint, `grant_type=fb_exchange_token` +
  `client_id`+`client_secret`+`fb_exchange_token` — long-lived User tokens last ~60 days
  (`expires_in` ≈ 5,184,000 seconds). See `meta-token-security.md` §2 for the resulting
  connection-health state model.
- Token inspection: `GET graph.facebook.com/debug_token?input_token=...&access_token=...`.
- **Not verified this pass — flag for Phase 3.1 direct lookup:** whether a non-expiring System
  User token is the better long-term credential for a server-to-server integration like this
  one (Meta's System User tokens are documented separately from the standard user OAuth flow
  fetched here). Recommend Phase 3.1 evaluate both before finalizing the token model in
  `meta-token-security.md`.

## 2. Application Flow (from META-002, unchanged in shape; endpoints above are the live update)

```
Browser
  ↓ "Connect Meta" (requires meta_connection.connect — OWNER/ADMIN only, already seeded in rbac-catalog.ts)
Backend-generated OAuth state
  ↓
Meta authorization dialog
  ↓
Callback (GET /meta/oauth/callback — no requireAuth() chain, authenticated by state instead,
          same pattern as the already-shipped POST /webhooks/clerk, which is also excluded
          from clerkMiddleware()'s authenticated matcher)
  ↓
State verification
  ↓
Code → token exchange (server-side only)
  ↓
Token validation (debug_token)
  ↓
Discover authorized business/ad accounts (meta-account-discovery.md)
  ↓
User selects account(s)
  ↓
Persist secure Meta Connection (meta-connection-model.md, meta-token-security.md)
  ↓
Initial sync (meta-sync.md §1)
  ↓
Connection healthy (meta-connection-health.md)
```

## 3. State Parameter Requirements (from META-002, unchanged — reconciled against no existing

gap, since this project has no prior OAuth-state precedent to reuse; this is a new primitive)

The `state` value must be:

- **Unpredictable** — cryptographically random, not derived from any user-visible or
  guessable value (never the workspace ID, user ID, or a timestamp alone).
- **Short-lived** — expires well before a realistic user OAuth-dialog completion time; an
  expired state on callback is treated identically to an invalid one (no distinguishing
  error message, matching this codebase's existing non-disclosure convention —
  `authorization.md` §3).
- **Bound to the initiating user/session and to the target workspace** — the callback must
  verify the state was issued for the same authenticated user (and workspace, since
  `meta_connection.connect` is workspace-scoped) that completed the Meta dialog; a state
  issued for workspace A can never complete a connection for workspace B, mirroring the
  cross-workspace-membership-spoof protections already tested throughout Phase 2.3–2.6.
- **Single-use** — consumed atomically on first valid callback; a replayed callback with the
  same state value is rejected (see `meta-threat-model.md` threats #1–#3).
- **Never client-controlled beyond opaque possession** — the browser carries the state value
  through the redirect but never constructs, inspects meaningfully, or is trusted to report
  its own validity; validation happens exclusively against server-held state, matching the
  governing task's explicit "Never allow client-controlled OAuth callback state to become
  trusted" instruction.

**Storage mechanism (open, Phase 3.1 implementation decision, not an architecture gap):**
either a short-TTL Redis key (this project already depends on Redis for BullMQ) or a
short-TTL database row. Redis is the natural fit given the existing dependency and the
short-lived, single-use nature of the value — recorded as a recommendation, not a decision
this phase makes final, since no code exists yet to bind it to.

## 4. Redirect URI Validation

The callback redirect URI is registered per-Meta-app (development and production apps have
distinct, explicitly allow-listed redirect URIs — see `meta-app-review.md` §2) and must never
be accepted as client-supplied input at request time; Meta itself rejects a mismatched
`redirect_uri` at both the dialog and token-exchange steps (confirmed live, §1 above), which
is a real, provider-enforced defense layer this application does not need to duplicate, only
must not weaken (e.g. by wildcarding a registered redirect domain).

## 5. Failure Handling (from META-002, unchanged)

| Failure                                                                 | Handling                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User denies authorization at the Meta dialog                            | Redirect back to the application with a clear, non-alarming "connection not completed" state — not an error page.                                                                                    |
| State missing/invalid/expired/replayed                                  | Reject before any token exchange is attempted; audit as a denied connection attempt (`meta-threat-model.md`).                                                                                        |
| Token exchange fails (Meta-side error)                                  | Surface via `meta-error-model.md`'s `AUTHENTICATION`/`TRANSIENT` categories as appropriate; never retry a token exchange with a reused `code` (Meta authorization codes are single-use by design).   |
| Token exchange succeeds but discovery finds zero authorized ad accounts | Connection is not created in a broken partial state — the user is told plainly that no assets were found/authorized, consistent with BR-013 ("must not fabricate Meta entities... or capabilities"). |

## 6. Disconnect (from META-002, unchanged)

`Disable new calls → revoke/remove credential where Meta's API supports revocation → preserve
required audit/history (BR-018: "Disconnecting Meta must not silently delete required audit
history") → mark DISCONNECTED → stop scheduled syncs → communicate freshness impact` to any
UI/AI surface that depended on the connection.

## 7. AI Boundary (already decided, Phase 2.4A — restated, not re-opened)

`docs/identity/permission-catalog.md`'s existing "Meta Connection" section already classifies
`meta_connection.connect`/`meta_connection.reconnect` as **AI-invocable: No** ("OAuth-adjacent,
credential-handling stays human-initiated") — this is pre-existing, owner-reviewed policy from
Phase 2.4A, not a new Phase 3A decision. No AI tool may initiate, approve, or complete any step
of this OAuth flow. See `phase-3-owner-decision-package.md` §1 for the formal restatement.
