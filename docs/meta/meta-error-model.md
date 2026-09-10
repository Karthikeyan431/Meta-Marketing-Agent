# Meta Error Model

**Document ID:** META-110 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Consolidates the error taxonomy from `ai-marketing-manager-gate-5-docs/docs/06-meta/
META_INTEGRATION_ARCHITECTURE.md` (META-001) and the governing task's own category list.

## 1. Normalized Error Categories

| Category                         | Meaning                                                                                                                        | Maps to this project's existing HTTP error convention                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHENTICATION`                 | Token invalid/expired/revoked                                                                                                  | 401-shaped at the Meta boundary → surfaces internally as `REAUTH_REQUIRED`/`REVOKED` connection health (`meta-token-security.md` §3), not a raw 401 to the API client, since the client's own session is separately authenticated |
| `AUTHORIZATION`                  | Permission insufficient for the requested operation (App-Review-gated scope missing, or Business-level access revoked)         | Same shape as `AuthorizationError` (403) already used throughout `apps/api`                                                                                                                                                       |
| `INVALID_PARAMETER`              | Malformed/invalid request to Meta                                                                                              | 400-shaped, mapped to this project's existing `VALIDATION_ERROR`                                                                                                                                                                  |
| `NOT_FOUND`                      | The requested Meta resource no longer exists / was deleted externally                                                          | Maps to `meta-resource-model.md` §5's lifecycle-status handling, not necessarily a client-facing 404                                                                                                                              |
| `RATE_LIMITED`                   | Meta's Business Use Case rate limit hit (`meta-rate-limits.md`)                                                                | Maps to this project's existing `RATE_LIMITED` error code                                                                                                                                                                         |
| `TRANSIENT_PROVIDER_FAILURE`     | Timeout, network error, Meta 5xx                                                                                               | Retryable (`meta-adapter-contract.md` §3)                                                                                                                                                                                         |
| `TIMEOUT`                        | Request exceeded the adapter's bounded timeout                                                                                 | Retryable, same as transient                                                                                                                                                                                                      |
| `UNSUPPORTED_OPERATION`          | The operation isn't supported for this object/account at all (e.g. attempting to "update" an immutable Creative)               | Rejected clearly per BR-014, never silently approximated                                                                                                                                                                          |
| `DEPRECATED_API`                 | The adapter is calling an endpoint/field Meta has deprecated for the pinned version                                            | Surfaces as an internal alert, not a user-facing error — this is an application maintenance signal                                                                                                                                |
| `PERMISSION_REVIEW_REQUIRED`     | The operation needs an App-Review-gated permission this app hasn't been approved for yet                                       | Distinct from `AUTHORIZATION` — this is an App-Review state, not a per-user grant issue (`meta-app-review.md`)                                                                                                                    |
| `BUSINESS_VERIFICATION_REQUIRED` | Meta requires Business Verification before this operation/permission is usable (live-verified, `meta-app-review.md` §1 item 5) | Distinct category — a business-level gate, not a user or token issue                                                                                                                                                              |
| `ACCOUNT_DISABLED`               | The Meta ad account itself is disabled (by Meta, for policy/billing reasons unrelated to this application)                     | Surfaced plainly, never retried                                                                                                                                                                                                   |
| `UNKNOWN_PROVIDER_FAILURE`       | Anything not classifiable into the above                                                                                       | Fail closed — never silently treated as success                                                                                                                                                                                   |

## 2. Rate-Limit Error Code Caveat (live-verification finding, flagged)

This phase's live Meta research found **conflicting sources** on the exact error code returned
when a Business Use Case rate limit is exhausted — a directly-fetched official page named error
codes 80000/80003/80004/80014 with message "too many calls from this ad-account, wait and try
again," while an independent search-sourced reference named error code 17. **REQUIRES
RE-VERIFICATION BEFORE PHASE 3.1** — the adapter's rate-limit detection (`meta-rate-limits.md`)
must not hardcode a single assumed error code without a direct, current confirmation; detection
should primarily key off the documented response headers (`X-Business-Use-Case-Usage`,
`X-Ad-Account-Usage`), which are consistently confirmed, rather than solely an error code.

## 3. Deprecation/Breaking-Change Findings (live-verification, medium confidence — flagged)

Multiple independent sources (not independently confirmed against Meta's own per-version
changelog pages this pass) describe: Advantage+ Shopping/App campaign creation/duplication/
update no longer allowed via the Marketing API as of v25.0 (also recorded in the 2026-09-04
`TECH_STACK.md` finding — this is now corroborated twice, raising confidence); ~85 legacy
organic engagement metrics stopped returning data mid-2026, replaced by newer metric names
(low relevance — organic, not paid-ad metrics, per `TECH_STACK.md`'s own prior assessment);
`breakdowns=dma` removed from Insights, replaced by `comscore_market`; webhook mTLS
certificates migrating to a Meta CA by March 31, 2026. **REQUIRES RE-VERIFICATION BEFORE PHASE
3.1** against the official v25.0/v26.0 changelog sub-pages directly (not yet fetched this
pass) before the adapter's field/endpoint list is finalized.

## 4. Mutation Verification (from META-001, unchanged)

`Request → response received → result persisted → read-after-write verification →
VERIFIED / VERIFICATION_FAILED`. **The application must not report an action as successful
until it has both a successful execution result from Meta and, where technically possible, a
verification read confirming the state actually changed.** This directly implements BR-008
("A failed Meta mutation must not be reported as successful") and BR-009 ("important mutations
verified after execution when technically possible"). `VERIFICATION_FAILED` is a distinct,
surfaced state — not silently retried as if it were the original mutation failing, since the
mutation itself may have succeeded even though verification could not confirm it (e.g. a
transient read failure immediately after a real write).

## 5. Error Body Handling

Raw Meta error bodies are never exposed blindly to end users or returned verbatim in an API
response — they are classified into §1's categories first; only the normalized category and a
safe, application-authored message reach the client, matching this project's existing
`error-handler.ts` convention of a safe, non-leaking message for every error surface.
