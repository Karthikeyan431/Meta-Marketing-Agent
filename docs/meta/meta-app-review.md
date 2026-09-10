# Meta App Architecture, Development/Test Strategy & App Review Readiness

**Document ID:** META-118 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates `ai-marketing-manager-gate-5-docs/docs/06-meta/META_APP_REVIEW_READINESS.md`
(META-010) with a live 2026-09-10 verification of Meta's current App Review and Business
Verification requirements. **No Meta app, credential, or App Review submission is created by
this document.**

## 1. Current API Version (live-verified 2026-09-10, supersedes but confirms the 2026-09-04

`TECH_STACK.md`/`ADR-005` finding)

**Source:** `developers.facebook.com/docs/graph-api/changelog` (directly fetched).

- **v26.0** — introduced 2026-07-29, latest, availability end date not yet set.
- **v25.0** — introduced 2026-02-18, supported until 2028-07-29, used in Meta's own current
  documentation examples. **Recommendation, unchanged from the prior verification pass**:
  target v25.0 as the initial pinned version — longer proven runway, avoids being an early
  adopter of a version released only ~6 weeks before this verification.
- v24.0 (2025-10-08) supported until 2028-02-18; v21.0–v23.0 and older have progressively
  expired.
- Meta has announced Marketing API version auto-upgrade beginning 2026-07-29 — Phase 3.1 must
  account for the possibility that a pinned version can be superseded by Meta's own auto-
  upgrade mechanism, not assume a pin is permanently stable without monitoring.

**Final pin remains a Phase 3.1 decision, re-verified at the moment implementation actually
starts** — this document updates the record, it does not finalize the pin, consistent with
ADR-005's own explicit scope ("production spend mutations remain disabled until this matrix is
verified" — restated, unchanged).

## 2. Meta App Architecture

- **Development Meta app** — used for all local/development/staging work; test users, test
  Business Manager, test Ad Account (§3). No production advertising spend ever flows through
  it.
- **Production Meta app** — distinct app, distinct credentials, used only once App Review and
  Business Verification (§4) are complete and the application is ready for real advertiser
  connections.
- **App mode** — Development mode restricts usage to app admins/developers/testers;
  Production/Live mode is required before real end-users can connect their own Meta accounts.
- **Allowed redirect URLs** — registered per-app, distinct between development and production
  (`meta-oauth.md` §4) — never a wildcard, never shared between the two apps.
- **Webhook configuration** — registered per-app, verified via the handshake in
  `meta-webhooks.md` §1; development and production apps have independent webhook
  subscriptions pointing at their respective environments.
- **Credential separation** — development and production Meta App ID/Secret are distinct
  values, stored per `meta-token-security.md` §7's environment-separation rule, never shared
  or reused across environments, never committed to source control.

## 3. Development / Test Account Strategy

- **Test users** — Meta-provided test user accounts for automated/manual development testing,
  never real personal or business accounts.
- **Test Business Manager + test Ad Account** — a dedicated, non-production Business Manager
  and Ad Account used for all integration testing (`meta-test-matrix.md` §1's "Integration"
  mode); this is the resource automated tests exercise, never a real advertiser's account.
- **Avoiding real production spend**: no automated test may create a mutation that could
  result in real advertising spend — `meta-test-matrix.md`'s "Integration" tests operate only
  against the test Ad Account, which per Meta's own test-account model does not process real
  charges; "Production Smoke" tests (§1 of that document) are read-only by definition.
- **Test data reset**: the test Business Manager/Ad Account's campaign data should be
  periodically reset or the test suite should be written idempotently against a known-clean
  starting state — exact mechanism a Phase 3.1 operational decision.
- **Credential rotation**: development credentials rotate independently of production ones,
  following the same rotation model as `meta-token-security.md` §5, applied to the app-level
  Secret rather than a per-connection user token.
- **Production separation**: enforced structurally by using an entirely distinct Meta app
  (§2), not merely a different environment variable value pointing at the same app.

## 4. App Review Requirements (live-verified 2026-09-10)

**Sources:** per-permission pages (`meta-permissions.md` §1), `developers.facebook.com/docs/app-review`
(fetched, thinner content — general requirements only).

All three permissions this integration needs (`ads_read`, `ads_management`,
`business_management`, plus their `pages_read_engagement`/`pages_show_list` dependencies —
`meta-permissions.md` §1) require App Review. Confirmed submission content requirements per
permission: a complete Facebook Login flow demonstration, display of actual ad performance
data (impressions, conversions, spend, clicks, reach) for `ads_read`, and specific written
justification for managing/reading ads or business assets on behalf of other businesses for
`ads_management`/`business_management`. The app must be testable by Meta's reviewers — "If we
are unable to access your app to test it, your entire submission will be rejected" (directly
quoted from the fetched general App Review page). **Turnaround time could not be verified live
— do not commit to a specific timeline in any product/launch plan without a fresh check closer
to submission.**

## 5. Business Verification (live-verified 2026-09-10)

**Source:** `developers.facebook.com/docs/development/release/business-verification`
(fetched).

Required for Advanced Access to the three permissions above (the access tier this integration
needs to serve real end-user workspaces, not merely development-mode testing). Process:
connect the app to a Business in the App Dashboard, complete Business Manager verification if
not already done, submit required documentation via a Business admin. **Exact document
checklist and timeline could not be verified live** (the fetched page deferred to the Business
Manager Help Center) — flag for direct confirmation before the production submission is
prepared.

## 6. Privacy, Terms, Data-Handling Disclosures, Redirect Domain

Not independently re-verified this pass beyond what App Review's general requirements imply
(a valid privacy policy and data-use disclosure are standard Meta App Review prerequisites) —
this project's existing `docs/ai-marketing-manager-phase-1a-architecture-finalization` corpus
does not yet contain a drafted privacy policy or terms document; producing one is outside this
architecture phase's scope and is recorded as a Phase 3.7 (Security/UAT/App Review readiness)
precondition, not resolved here.

## 7. Production Rollout / Rollback Plan

A staged rollout (development app → production app in Development mode with a small set of
known test/pilot workspaces → full Live mode) is the recommended pattern, consistent with this
project's own staged-phase discipline throughout Phases 2.1–2.6. Rollback for a Meta
integration specifically means: the ability to disable new connections/mutations
workspace-by-workspace or globally without a code deploy (an operational kill-switch,
conceptually related to but distinct from the emergency-stop behavior already named in
`meta-threat-model.md`'s AI-boundary threat #20 and `SPEND_AND_FINANCIAL_CONTROLS.md`'s
emergency-stop control) — exact mechanism a Phase 3.7 implementation decision.

## 8. Summary of Items Requiring Re-Verification Before Phase 3.1

Collected from across this document set, for a single point of reference:

1. Exact Business Use Case rate-limit error code (`meta-error-model.md` §2).
2. Specific deprecation/breaking-change details beyond the Advantage+ finding, which is now
   corroborated twice (`meta-error-model.md` §3).
3. Insights API sync-vs-async threshold and exact size/date-range limits (`meta-insights.md`
   §1).
4. Whether a Meta System User (non-expiring) token is preferable to the standard long-lived
   user token for this integration (`meta-oauth.md` §1, `meta-token-security.md` §1).
5. Webhook mTLS certificate migration details, if mTLS is used (`meta-webhooks.md` §1).
6. App Review turnaround time (§4 above).
7. Business Verification document checklist and timeline (§5 above).
8. The final API version pin itself, re-verified at the moment Phase 3.1 implementation
   actually begins (§1 above; ADR-005's own standing scope).
