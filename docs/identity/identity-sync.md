# Clerk ↔ Application Synchronization

**Document ID:** IDENT-008 | Version 1.0 | Status: Draft for Approval | Phase: 2A (Architecture Finalization)

Design only — no webhook endpoint, no event handler, and no Clerk webhook subscription is
created in this phase. This mirrors the already-approved pattern for Meta synchronization
(`META_WEBHOOKS.md`, `SYNC_DATA_MODEL.md`): **webhooks complement, never replace,
reconciliation.**

## 1. Events In Scope

Per `clerk-integration.md` finding #8, the exact full event catalog must be confirmed
against the live Clerk Dashboard's Event Catalog before Phase 2 implementation — the
following are the confirmed-by-documentation event families this design handles:

| Event                                                                            | Effect on our database                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.created`                                                                   | Upsert a `users` row keyed by `clerk_user_id`. Does **not** create any `workspace_memberships` row — workspace membership is established separately (invitation acceptance or workspace creation), never implied by user creation alone.                                                                                                                                                                                      |
| `user.updated`                                                                   | Update the mirrored profile fields on `users` (display name, email metadata) that `SCHEMA_DESIGN.md`'s `users` table calls for. Never overwrites application-only fields we own (e.g. any future user-level preferences) with Clerk data.                                                                                                                                                                                     |
| `user.deleted`                                                                   | See §User Deletion Handling below — not a simple row delete.                                                                                                                                                                                                                                                                                                                                                                  |
| `organization.created`                                                           | If using the 1:1 Clerk-Org-to-Workspace mapping (`workspace-model.md` §2), upsert a `workspaces` row with `clerk_org_id` set. If a workspace was instead created first in our own database (application-initiated creation, then a Clerk Organization created to back it), this event reconciles/confirms the mapping rather than creating a duplicate — matched by an idempotency key established at creation time (see §3). |
| `organization.updated`                                                           | Update mirrored workspace fields (name) only — `status`, `timezone`, and `configuration` are application-owned and never overwritten by this event.                                                                                                                                                                                                                                                                           |
| `organization.deleted`                                                           | Mark the workspace deleted/inactive per `workspace-model.md`'s deleted-workspace behavior. Does not hard-delete audit history (`DATA_RETENTION.md`).                                                                                                                                                                                                                                                                          |
| `organizationMembership.created` _(event name to be confirmed — see finding #8)_ | Upsert a `workspace_memberships` row. **Role is never taken from the Clerk event** — a newly synced membership defaults to the least-privileged role (`VIEWER`) until explicitly assigned a role in our own system, since Clerk's own Organization role (if used at all) is not our authorization role (`clerk-integration.md` finding #6).                                                                                   |
| `organizationMembership.updated`                                                 | Update membership `status` only (e.g., active/suspended mirrored from Clerk-side state) — never the `role` column, for the same reason as above.                                                                                                                                                                                                                                                                              |
| `organizationMembership.deleted`                                                 | Mark the `workspace_memberships` row inactive/removed. Takes effect on the membership's next authorization check per `workspace-model.md` §5 — no special-cased immediate session invalidation is assumed unless a real-time requirement is later added (open decision).                                                                                                                                                      |
| `organizationInvitation.created` / `.revoked`                                    | Informational mirroring only, for UI purposes (pending-invitation display) — invitation state itself is not an authorization fact; only a resulting `organizationMembership.created` event (or its equivalent application-initiated flow) grants membership.                                                                                                                                                                  |
| `session.*`                                                                      | Not synced to our database at all — session validity is checked live via Clerk (`authentication.md` §1), never mirrored into a local table that could drift stale.                                                                                                                                                                                                                                                            |

## 2. Webhook Endpoint Design

```text
POST /webhooks/clerk
  1. Verify signature via Clerk's verifyWebhook() helper (CLERK_WEBHOOK_SIGNING_SECRET)
     — clerk-integration.md finding #7. Invalid signature → reject immediately, no
     processing, no information disclosure in the response body.
  2. This route is excluded from clerkMiddleware()'s authenticated-route matching —
     Clerk cannot present a user session to its own webhook caller.
  3. Persist a minimal event envelope (event id, type, received_at) before any processing
     — same discipline as META_WEBHOOKS.md's "persist before processing" rule.
  4. Fast-acknowledge with 2xx as soon as the envelope is durably persisted.
  5. Process asynchronously (enqueued, not inline) — consistent with this project's
     existing background-job pattern (packages/queue), not a new one invented for Clerk.
  6. Idempotency: event processing is keyed by Clerk's own event ID. A duplicate delivery
     (finding #7 confirms retries happen on any non-2xx) is a no-op if that event ID was
     already processed to completion.
```

## 3. Ordering and Idempotency

Clerk's own documentation does not guarantee webhook delivery ordering (only at-least-once
delivery on a retry schedule — finding #9). This design therefore:

- Never assumes `organization.created` arrives before a subsequent
  `organizationMembership.created` for the same organization in strict order — each
  handler is written to tolerate its "parent" not yet existing locally by deferring
  (re-queueing with backoff) rather than failing hard, bounded by a maximum deferral count
  before it is treated as a reconciliation-pass concern instead.
- Uses **event timestamp**, not arrival order, to resolve conflicting updates to the same
  entity (e.g., an `organization.updated` that arrives after a newer state has already been
  established by reconciliation is a no-op, not a regression).
- Never derives a security decision from event _order_ — e.g., a membership removal
  followed by a delayed, out-of-order membership-update event must never be interpreted as
  "restoring" access; the reconciliation pass (§4) is the authority for resolving any such
  ambiguity, not the webhook stream's arrival order.

## 4. Reconciliation (the backstop, per finding #9)

Because Clerk explicitly states webhooks are not guaranteed to be delivered "immediately or
at all," a periodic reconciliation job (exact schedule is a Phase 2 implementation
decision) pulls current organization/membership state from Clerk's Backend API and
reconciles it against our database using the same fetch → normalize → upsert-by-external-
identity → mark-observed pattern already established and approved for Meta sync
(`SYNC_DATA_MODEL.md`). This is the same architectural pattern, reused, not a new one
invented for identity.

## 5. User Deletion Handling

`user.deleted` cannot be a blind row delete, because a deleted Clerk user may:

- still own audit history that must be retained (`DATA_RETENTION.md`, `AUDIT_LOGGING.md`
  §Audit Integrity — audit records referencing this user as an actor must remain
  attributable, not silently orphaned or nulled in a way that breaks audit trail
  integrity);
- have pending approvals or proposed actions attributed to them — these must be resolved
  (expired, reassigned, or explicitly left attributed to a now-deleted user with a clear
  "deleted user" marker) per a Phase 2 decision, not silently ignored;
- still be referenced by workspace membership history that other members may need to see
  ("who removed this campaign" should not become an unattributable ghost action).

**Recommendation:** soft-delete/anonymize the `users` row's Clerk-sourced profile fields
while retaining the row itself and its ID for referential integrity of historical
audit/action records — exact field-level treatment is a Phase 2 implementation decision.

## 6. Failure Handling

A webhook handler that fails after signature verification but before successful processing
returns a non-2xx status, relying on Clerk's own retry schedule (finding #7) rather than
implementing a separate custom retry mechanism. Handlers must be safe to re-invoke for the
same event any number of times (idempotency per §2 step 6) — a handler is never allowed to
partially apply a change and then error, leaving inconsistent state that a retry would
then double-apply.
