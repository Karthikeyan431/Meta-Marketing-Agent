# Meta Token Security & Connection Health States

**Document ID:** META-104 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-6-security-docs/docs/07-security/META_CREDENTIAL_SECURITY.md`
(SEC-006), `.../ENCRYPTION_SECRETS.md` (SEC-011), `ai-marketing-manager-gate-11-development-
readiness/.../SECRETS_CONFIG.md` (DEVOPS-008), and the live-verified Meta token lifetimes from
`meta-oauth.md` §1. No credential, encryption key, or storage mechanism is created by this
document — conceptual model only.

## 1. Token Type & Lifetime (live-verified, `meta-oauth.md` §1)

Long-lived User access token, exchanged server-side from the short-lived code-flow token.
Lifetime ≈ 60 days (`expires_in` ≈ 5,184,000 seconds), not indefinite — the connection health
model (§3) must actively track and act on this expiry, not assume a token remains valid
indefinitely once issued. **Flagged for Phase 3.1 direct verification** (not confirmed this
pass): whether a non-expiring Meta System User token is preferable for this server-to-server
integration — if adopted, the expiry-tracking requirement below still applies to detect
revocation, just not calendar-based expiry.

## 2. Storage Requirements (from SEC-006, verbatim rules — unchanged, restated for Meta)

- Meta credentials/tokens are **never** returned to the browser after connection, placed in an
  AI prompt, stored in a conversation message, written to an ordinary application log, or
  exposed through any analytics response.
- Storage: encrypted secret storage or strong application-layer encryption with managed
  key protection (SEC-011: "Prefer managed KMS/secret-management infrastructure" — this
  project's Phase 1A `EXTERNAL_DEPENDENCIES.md` already names AWS Secrets Manager, ADR-006, as
  the project's chosen secret-management service; Meta credentials should use the same
  mechanism, not a bespoke one).
- Separate storage for: credential ciphertext/reference, token metadata (expiry, scopes,
  last-validated timestamp), and connection status — never one undifferentiated blob.
- Access: only the Meta integration service (the adapter, `meta-adapter-contract.md`) may
  retrieve raw credential material. Every other application service (routes, workers, AI
  tools) operates on a credential **reference**, never the raw token.

## 3. Connection Health State Model

Five states, per the governing task's explicit model, reconciled against `ai-marketing-manager-
gate-8-uiux-docs/docs/09-uiux/CONNECTION_SETUP_UX.md` (UI-008)'s 8 UX-facing states:

| Application state (this document, authoritative for backend/API) | UX-facing equivalent (UI-008)                                                                  | Meaning                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                                                                | Not connected                                                                                  | No `MetaConnection` row exists yet for this workspace.                                                                                                                                                                                                                                                                                                    |
| —                                                                | Connecting                                                                                     | OAuth in progress (state issued, callback not yet completed) — transient, not a stored connection state.                                                                                                                                                                                                                                                  |
| **CONNECTED**                                                    | Connected                                                                                      | Token valid, last validation succeeded, capabilities current.                                                                                                                                                                                                                                                                                             |
| **DEGRADED**                                                     | Degraded                                                                                       | Connection exists and token is nominally valid, but a recent API call failed in a way that suggests partial trouble (rate-limited repeatedly, one or more previously-available capabilities now missing) without yet requiring reauthorization.                                                                                                           |
| **REAUTH_REQUIRED**                                              | Reconnect required                                                                             | Token expired, or a validation call returned an authentication/authorization failure that reauthorization (not merely retrying) would resolve.                                                                                                                                                                                                            |
| **DISCONNECTED**                                                 | Disconnected                                                                                   | User-initiated disconnect completed — credential revoked/removed where Meta's API supports it, scheduled syncs stopped.                                                                                                                                                                                                                                   |
| **REVOKED**                                                      | (maps to Reconnect required or Disconnected in UI-008's 8-state model, disambiguated by cause) | Meta-side revocation detected independently of a user-initiated disconnect (e.g. the user removed the app's access directly in Meta, or a Business admin revoked the grant) — distinguished from `DISCONNECTED` because it was not initiated through this application, which is relevant for audit and for explaining to the user why access disappeared. |

**Reconciliation note:** UI-008's 8-state model is UX-presentation granularity (it separately
surfaces "Connecting" and "Authorization required" as distinct transient states during the
flow itself); the 5-state model above is the durable, stored `MetaConnection.status` value.
These are not in conflict — the UX layer may present more states than the database persists,
as long as every transient UX state ultimately resolves to one of the 5 stored states. Phase
3.2 (connection/token lifecycle implementation) should treat this table as the authoritative
mapping rather than re-deriving it.

## 4. Health-Check & Detection

A connection's health is not assumed correct between checks — `meta-connection-health.md`
defines the detection/health-check behavior; this document defines only the state machine
and storage rules those checks act on. Detection sources: a proactive scheduled validation
call (`debug_token` or an equivalent lightweight read), and reactive detection when any real
API call fails with an authentication/authorization-shaped error (`meta-error-model.md`).

## 5. Rotation, Reconnection, Revocation

- **Expiry detection**: before the ~60-day window elapses, or immediately on any
  authentication failure.
- **Invalidation detection**: any API call returning an auth-shaped error updates health state
  before the next scheduled check, not only on the schedule.
- **Reconnection**: re-runs the OAuth flow (`meta-oauth.md`); on success, the existing
  `MetaConnection` row's credential reference is replaced, not duplicated — one connection
  identity persists across reconnections (see `meta-connection-model.md` §4's uniqueness rule).
- **Credential replacement / secure deletion**: on disconnect or reconnect-with-different-
  account, the prior credential material is deleted from secret storage, not merely
  unreferenced.

## 6. Incident Response (from SEC-006, unchanged)

`Disable the connection → prevent new external mutations → rotate/revoke the credential →
investigate via audit logs → notify per the project's incident policy`. This sequence applies
whether the trigger is a suspected credential leak, a Meta-side security notice, or an internal
security finding — not only user-initiated disconnects.

## 7. Environment Separation (from ENVIRONMENTS.md / DEVOPS-002, unchanged)

No production Meta credential in local/development environments. Staging must never spend real
advertising budget through automated tests (`meta-test-matrix.md` §6). Production Meta
credential access is least-privilege and audited, consistent with every other production
secret category in this project.
