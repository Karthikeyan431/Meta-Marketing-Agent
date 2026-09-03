# Action and Approval Security
**Document ID:** SEC-009 | Version 1.0

## Action Lifecycle

```text
PROPOSED
  ↓
VALIDATED
  ↓
POLICY_EVALUATED
  ↓
PENDING_APPROVAL
  ↓
APPROVED
  ↓
EXECUTING
  ↓
VERIFIED
```

Alternative terminal states:
- REJECTED
- FAILED
- VERIFICATION_FAILED
- CANCELLED
- EXPIRED

## Approval Binding
Approval must bind to:
- action ID
- exact target
- exact parameters
- policy version
- action version/hash
- approver
- timestamp
- expiry

If parameters change, the previous approval becomes invalid.

## No Approval Bypass
AI cannot approve its own high-risk action unless a separately defined, deterministic auto-approval policy explicitly permits that operation.

## Replay Defense
Expired/used approvals cannot execute again.

## Emergency Stop
Authorized administrators can block high-risk execution immediately.
