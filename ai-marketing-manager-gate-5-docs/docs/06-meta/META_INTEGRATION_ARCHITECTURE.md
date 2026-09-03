# AI Marketing Manager — Meta Integration Architecture
**Document ID:** META-001 | Version 1.0 | Status: Draft for Approval

## Purpose
Define the production integration boundary between the platform and Meta advertising infrastructure.

## Design Principles
1. Meta is an external system of record for externally managed advertising state.
2. Internal canonical IDs are separate from Meta IDs.
3. All Meta calls pass through a dedicated adapter.
4. Credentials never enter browser state, prompts, logs, or audit payloads.
5. Mutations require application authorization and policy evaluation.
6. External state is verified after important mutations.
7. API versions, permissions and supported capabilities are configuration/release concerns, not hard-coded assumptions throughout the domain.

Meta Webhooks can provide real-time notifications for supported objects, including ad accounts, and should complement—not replace—periodic reconciliation. citeturn1search1turn1search13

## Integration Boundary

```text
Browser
  ↓
Application API
  ↓
Meta Integration Service
  ├── OAuth / connection management
  ├── Token lifecycle
  ├── Capability discovery
  ├── Request builder
  ├── Response normalization
  ├── Error classifier
  ├── Rate-limit handling
  └── API-version isolation
        ↓
     Meta APIs
```

## Connection Lifecycle

```text
Connect Meta
 ↓
OAuth authorization
 ↓
Callback validation
 ↓
Exchange/validate credential
 ↓
Discover authorized businesses/accounts/assets
 ↓
User selects workspace/account scope
 ↓
Encrypt/store credential reference
 ↓
Initial synchronization
 ↓
Connection = ACTIVE
```

The implementation must validate token identity/expiry and related metadata using Meta's supported token-debugging mechanisms. citeturn1search0

## Reconnection
If a token becomes invalid/expired:
- mark connection degraded
- stop new mutations
- preserve existing data
- request reconnection
- resume sync after successful validation

## Capability Model
Store capabilities rather than assuming every connected account supports every operation.

Example:
- READ_AD_ACCOUNT
- READ_CAMPAIGN
- READ_INSIGHTS
- CREATE_CAMPAIGN
- UPDATE_BUDGET
- UPDATE_STATUS
- CREATE_AD_SET
- CREATE_AD
- MANAGE_CREATIVE
- RECEIVE_AD_ACCOUNT_WEBHOOKS

Actual permissions and capability availability must be verified against Meta's current documentation and app configuration during implementation/review.

## API Version Strategy
- Centralize Graph/Marketing API version configuration.
- Do not scatter version strings through domain code.
- Record API version used for material external operations.
- Maintain compatibility tests before upgrading.
- Upgrade deliberately rather than automatically.

## Rate Limits
The adapter must:
- classify rate-limit responses
- respect provider guidance
- apply bounded exponential backoff
- avoid retry storms
- expose retry-after information where available
- coordinate concurrent jobs for the same account

## Pagination
All list endpoints must support provider pagination. Never assume one response contains all resources.

## Error Classification
Map external errors into:
- AUTHENTICATION
- AUTHORIZATION
- RATE_LIMIT
- VALIDATION
- NOT_FOUND
- CONFLICT
- TRANSIENT
- PROVIDER_UNAVAILABLE
- UNKNOWN

Domain/application code should consume canonical errors rather than provider-specific error shapes.

## Webhooks
Use Meta webhooks where the required object/topic is supported.

Webhook flow:
```text
Meta
 ↓
HTTPS webhook endpoint
 ↓
Signature/authenticity validation
 ↓
Persist event
 ↓
Deduplicate
 ↓
Queue processing
 ↓
Update canonical state
 ↓
Audit/observability
```

Webhook processing must be asynchronous and idempotent.

## Synchronization
Webhooks provide low-latency signals; scheduled reconciliation provides correctness.

Minimum strategy:
- initial full sync
- periodic incremental sync
- webhook-triggered targeted sync
- periodic reconciliation
- freshness tracking

## Mutation Verification
For high-impact operations:
```text
Create/Update request
 ↓
Meta response
 ↓
Persist external operation result
 ↓
Read-after-write verification where appropriate
 ↓
Mark VERIFIED or VERIFICATION_FAILED
```

The assistant must not say an action succeeded until the application has a successful execution result and required verification.

## External Payload Policy
Do not store complete Meta payloads by default. Persist normalized fields and only retain raw payloads when justified for debugging/audit and protected by retention controls.
