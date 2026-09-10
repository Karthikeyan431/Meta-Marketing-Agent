# Meta Test Matrix

**Document ID:** META-117 | Version 1.1 | Status: OAuth/Credentials/Workspace/Account/API/Security categories implemented (Phase 3.1/3.2); Sync/Webhook/AI categories remain unimplemented | Phase: 3A (Architecture Finalization, closed); Phase 3.1/3.2 (Implementation, complete for their own categories)

## 0. Implementation Status (Phase 3.2, 2026-09-10)

`tests/integration/api-meta-discovery.test.ts` (39 tests) implements this matrix's
**Account** category in full (discovery, duplicate/re-discovery-updates, account removed via
the "unknown Meta account" rejection path, account disabled) plus the **Workspace**,
**Security**, and applicable **API** rows for Phase 3.2's own surface (discovery/selection/
deselection). Concurrency scenarios (simultaneous selection of the same account, simultaneous
selection of the same external ID across two different workspaces) are also covered, extending
this matrix beyond its originally-listed categories since Phase 3.2 introduces the project's
first true multi-writer race on a single logical resource. **Sync**, **Webhook**, and **AI**
rows remain entirely unimplemented (Phase 4+/5+/AI-tool-phase scope, as this document already
anticipated). See `phase-3-2-implementation-report.md` §9 for the full test list.

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_TEST_STRATEGY.md` (META-009),
`ai-marketing-manager-gate-9-testing-docs/docs/10-testing/META_INTEGRATION_TESTING.md`
(TEST-005), and `CRITICAL_TEST_MATRIX.md`'s Meta-relevant rows, expanded to the governing
task's full required-category list. **No test is written by this document** — this is the
matrix Phase 3.1+ implements against, following this project's established pattern (every
prior phase's test-matrix document preceded, not followed, its implementation).

## 1. Test Modes (from TEST-005, unchanged)

- **Mock** — adapter unit tests against fixture Meta responses, no network call.
- **Contract** — schema/version-behavior tests confirming the adapter's assumptions about
  Meta's response shape still hold.
- **Integration** — real calls against Meta's own test/development resources
  (`meta-app-review.md` §3), never production advertising accounts.
- **Production Smoke** — minimal, read-only health checks only, run before enabling any
  mutation capability in production.

## 2. Required Categories

**OAuth**: valid state; invalid state; expired state; replay; redirect mismatch.

**Credentials**: valid token; expired token; revoked token; insufficient permissions; token
leakage (asserting a token never appears in a log line, response body, or error message).

**Workspace**: correct workspace; wrong workspace; malicious ad-account ID; malicious business
ID; cross-workspace connection attempt.

**Account**: account discovery; duplicate account (re-discovery of an already-connected
account updates, not duplicates); account removed (externally, on Meta's side); account
disabled.

**API**: timeout; rate limit; provider 5xx; invalid parameter; permission failure; deprecated
endpoint (adapter must surface `DEPRECATED_API`, not silently fail).

**Sync**: initial sync; retry; duplicate event; missing event; out-of-order event; partial
failure (asserting per-item outcome tracking, `meta-sync.md` §4); deleted resource.

**Webhook**: valid signature; invalid signature; replay; duplicate; out-of-order.

**Security**: IDOR; BOLA; token exposure; OAuth CSRF; workspace escape — directly exercising
`meta-threat-model.md`'s 20 threats, each of which names its own test reference in that
document's table.

**AI** (no AI tool exists yet — these tests apply once a future phase implements one, recorded
here so that phase doesn't have to re-derive the requirement): unauthorized Meta account;
wrong workspace; unauthorized mutation; tool argument manipulation.

## 3. Test Quality Requirement (reusing this project's own established standard)

Consistent with every prior phase's test suite in this codebase (Phase 2.3–2.6): security-
relevant scenarios must be exercised as real integration tests against the actual HTTP
surface and a real Postgres/Redis instance where applicable — not solely unit tests against
mocked authorization helpers. `meta-threat-model.md`'s threats #6–#8 (cross-workspace/IDOR/
BOLA) in particular must follow the same `app.inject()`-based real-request pattern already
used throughout `tests/integration/api-workspace-members.test.ts` and
`tests/integration/api-workspaces.test.ts`.

## 4. Reused Patterns, Not New Ones

- Clerk token mocking (`vi.mock("@clerk/backend", ...)`) is the existing pattern for
  simulating an authenticated session — Meta adapter calls should be mocked the same way
  (`vi.mock` around the Meta client construction point), matching how the invite route's
  tests already mock `createClerkClient`'s `organizations.createOrganizationInvitation`
  (Phase 2.5) — the identical technique applies to mocking the Meta adapter.
- Webhook signature testing reuses the existing `POST /webhooks/clerk` test file's structure
  (`tests/integration/api-webhooks-clerk.test.ts`) as its template — valid/invalid signature,
  duplicate-event handling, and queue-enqueue assertions are already proven patterns in this
  codebase, not new ones to invent for Meta.
