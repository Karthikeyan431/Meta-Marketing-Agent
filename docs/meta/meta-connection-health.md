# Meta Connection Health Model

**Document ID:** META-114 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Extends `meta-token-security.md` §3's state model with detection, notification, reconnect, and
recovery behavior. Reconciles `ai-marketing-manager-gate-8-uiux-docs/docs/09-uiux/
CONNECTION_SETUP_UX.md` (UI-008)'s 8 UX-facing states against the 5 stored states.

## 1. States (restated from `meta-token-security.md` §3)

`CONNECTED`, `DEGRADED`, `REAUTH_REQUIRED`, `DISCONNECTED`, `REVOKED` — see that document's
§3 table for the full UI-008 reconciliation.

## 2. Health-Check Behavior

Two detection paths, neither sufficient alone:

- **Proactive**: a scheduled, lightweight validation call (token inspection or an equivalent
  minimal read) runs periodically per connection, independent of whether any real sync/insight
  job happens to run — so a revoked or expiring token is caught even for a workspace that
  hasn't triggered any other Meta activity recently.
- **Reactive**: any real API call (sync, insights, a future mutation) that fails with an
  authentication- or authorization-shaped error (`meta-error-model.md` §1) immediately updates
  the connection's health state — the application does not wait for the next scheduled check
  to reflect a known-bad connection.

## 3. Automatic Detection of Degradation vs. Full Reauth

A single transient failure does not immediately flip a connection to `REAUTH_REQUIRED` — that
would create UI/notification noise for ordinary transient provider hiccups
(`meta-error-model.md`'s `TRANSIENT_PROVIDER_FAILURE`/`TIMEOUT` categories). `DEGRADED` is the
intermediate state for a connection showing trouble signals (repeated rate-limiting, a
capability that recently stopped working) without a definitive authentication/authorization
failure; `REAUTH_REQUIRED` is reserved for an actual auth-shaped failure or confirmed token
expiry.

## 4. User Notification

The exact notification mechanism (in-app banner, email, etc.) is a product/UI decision outside
this architecture document's scope — the requirement recorded here is only that a transition
into `DEGRADED`, `REAUTH_REQUIRED`, or `REVOKED` must be surfaced to the workspace's
authorized users (at minimum, OWNER/ADMIN, who hold `meta_connection.reconnect`) rather than
silently logged only.

## 5. Reconnect Flow

Re-runs `meta-oauth.md`'s flow; on success, updates the existing `MetaConnection` row per
`meta-token-security.md` §5, transitions back to `CONNECTED`, and triggers the re-sync
described in `meta-sync.md` §5.

## 6. Disabled-Account Behavior

A Meta-side disabled ad account (`meta-error-model.md`'s `ACCOUNT_DISABLED` category) is
distinct from a connection-level health problem — the connection itself may remain `CONNECTED`
while one specific ad account under it is flagged unavailable. This is an ad-account-level
status (`meta-resource-model.md`), not a connection-level one, and must not be conflated with
`REAUTH_REQUIRED`.

## 7. Recovery After a Temporary Provider Outage

A Meta-side outage produces `TRANSIENT_PROVIDER_FAILURE`/`TIMEOUT` errors across potentially
many connections simultaneously — the application must not interpret a provider-wide outage as
every affected connection individually needing reauthorization. `DEGRADED` (or no state change
at all, for a single transient blip) is the correct classification; recovery is automatic once
Meta's API becomes reachable again and a subsequent health check or real call succeeds,
requiring no user action.
