# Meta Webhook Architecture

**Document ID:** META-113 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_WEBHOOKS.md` (META-006),
`ai-marketing-manager-gate-7-api-docs/docs/08-api/WEBHOOK_API.md` (API-011), and a live
verification of Meta's current webhook mechanics. **No webhook endpoint, signature
verification, or queue is implemented by this document.**

## 1. Live-Verified Mechanics (2026-09-10)

**Sources:** `developers.facebook.com/docs/graph-api/webhooks/getting-started`,
`.../webhooks-for-ad-accounts/` (both directly fetched).

- **Verification handshake**: Meta sends a `GET` request with `hub.verify_token` and
  `hub.challenge`; the endpoint must confirm the token matches its configured value and echo
  the challenge back — required for `GET /webhooks/meta` (API-011's already-specified route).
- **Signature verification**: `X-Hub-Signature-256` header, SHA-256 HMAC computed over the
  raw request payload using the Meta App Secret — must be verified against the raw bytes,
  before any JSON parsing, mirroring the existing `POST /webhooks/clerk` pattern in this
  codebase exactly (`apps/api/src/app.ts`'s content-type parser already captures raw body
  bytes onto `request.rawBody` specifically for this purpose — the same mechanism is directly
  reusable for a Meta webhook route, not a new one).
- **Payload**: `POST` JSON, `{object, entry: [{id, uid, changes/changed_fields}]}`, batched up
  to 1,000 updates per delivery.
- **Ad Account webhook topics — narrower than commonly assumed**: only 5 specific documented
  fields exist for Ad Account webhooks — `with_issues_ad_objects`, `in_process_ad_objects`,
  `ad_recommendations`, `creative_fatigue`, `product_set_issue`. **There is no generic
  "campaign changed" or "ad set changed" webhook event.** This confirms `meta-sync.md` §1's
  note: webhooks are a freshness accelerator for specific conditions, not a replacement for
  incremental sync/reconciliation as the primary mechanism for detecting campaign-hierarchy
  changes. Requires `ads_management` + edit access to the ad account.
- **mTLS certificate migration** (medium-confidence, from search corroboration, not
  independently fetched): webhook mTLS certificates reportedly migrating to a Meta CA by
  March 31, 2026 — **REQUIRES RE-VERIFICATION BEFORE PHASE 3.1** if mTLS is used.

## 2. Endpoint (already specified, Gate 7 `WEBHOOK_API.md`, API-011 — unchanged)

`POST /webhooks/meta` (processing) + `GET /webhooks/meta` (verification handshake) — mirrors
the existing `POST /webhooks/clerk` pattern exactly: no `requireAuth()` chain, excluded from
`clerkMiddleware()`'s authenticated matcher, authenticated instead by Meta's own signature.

## 3. Processing Pipeline (from META-006, unchanged)

```
Webhook event received
  ↓
Validate authenticity (X-Hub-Signature-256, §1)
  ↓
Validate object/topic (is this a topic this application subscribes to and understands?)
  ↓
Generate deterministic event identity (for deduplication — §4)
  ↓
Persist raw/minimal envelope
  ↓
Return success promptly (Meta expects a fast ack — do not block on downstream processing)
  ↓
Enqueue for async processing (reuses packages/queue, same pattern as the existing Clerk
                                webhook → BullMQ job flow)
  ↓
Deduplicate
  ↓
Reconcile the affected entity (trigger a targeted incremental sync, not a blind mutation
                                 from the webhook payload alone)
  ↓
Audit
```

## 4. Reliability (from META-006, unchanged)

Fast acknowledgment, asynchronous processing, idempotent consumers, retry transient failures
only, dead-letter handling for permanently-failing events, periodic reconciliation as the
backstop (`meta-sync.md` §1) — identical philosophy to this project's already-shipped Clerk
webhook + reconciliation pattern (`identity-sync.md`), not a new design.

## 5. Structural Question: Reuse `workers/webhook` or a Distinct Package?

The current `workers/webhook` package is Clerk-identity-specific — its queue name is
`webhook`, its job constant is `CLERK_WEBHOOK_EVENT_JOB_NAME`, and its processor
(`apply-webhook-event.ts`) is written against Clerk event shapes only. `WORKER_ARCHITECTURE.md`
(ARCH-005) separately names a "Webhook Worker" responsible for "processes Meta webhook events"
as one of six worker types, distinct in concept from the Clerk-specific one currently
implemented.

**Recommendation (not a decision this phase makes final — Phase 3.6 implementation choice)**:
extend `workers/webhook` with a second, Meta-specific job type/processor on the same queue
infrastructure, rather than creating a seventh worker package — the underlying BullMQ
bootstrap, health/readiness server, and graceful-shutdown pattern
(`ai-marketing-manager-gate-2-docs` ARCH-005's shared worker conventions, already implemented
identically across all six current worker packages) are provider-agnostic; only the job
processor logic is Clerk-specific today. Splitting into a dedicated Meta webhook worker
package remains a valid alternative if operational isolation (independent scaling, independent
failure blast radius) is judged more valuable than the smaller footprint of extending the
existing package — recorded as an open implementation choice, not a blocker, since either
resolves cleanly within the existing worker architecture without a new pattern.

## 6. Security Boundary (from META_SECURITY_BOUNDARY.md / META-008, and this document's own

META-006, unchanged — restated as the single most important rule in this document)

**A webhook must never directly perform an unrestricted mutation.** A webhook event can trigger
synchronization (a read/reconciliation action) but must never bypass application authorization
or policy to perform a write. Any webhook-triggered change to locally-stored data goes through
the same authorization/policy chain any other mutation would — the webhook's arrival is a
trigger, never itself a grant of authority.

```
Webhook event
  ↓
validate
  ↓
persist
  ↓
enqueue
  ↓
process
  ↓
authorization/policy
  ↓
audit where appropriate
```
