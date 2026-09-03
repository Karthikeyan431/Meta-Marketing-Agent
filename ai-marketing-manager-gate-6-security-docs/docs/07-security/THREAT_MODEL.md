# Threat Model and Attack Surface
**Document ID:** SEC-002 | Version 1.0

## Assets
- Meta credentials/tokens
- user sessions
- workspace membership
- advertising account access
- campaign configuration
- performance data
- AI conversation/context
- action approvals
- advertising spend
- audit history
- generated reports

## Threat Actors
- unauthenticated attacker
- compromised user account
- malicious workspace member
- malicious customer input
- malicious external ad/creative text
- compromised dependency
- provider/API failure
- insider with excessive privileges

## Major Threats

| Threat | Impact | Primary Controls |
|---|---|---|
| Credential theft | Critical | encryption, secret isolation, redaction |
| Cross-tenant access | Critical | workspace authorization, scoped queries |
| Prompt injection | High | untrusted-data boundary, typed tools |
| Excessive AI agency | Critical | least-privilege tools, policy, approval |
| Account takeover | Critical | strong auth, session controls |
| IDOR/BOLA | Critical | object-level authorization |
| Spend abuse | Critical | limits, approval, idempotency |
| Webhook spoofing | High | authenticity validation |
| API abuse | High | rate limits, quotas |
| Data leakage | High | minimization, field-level controls |
| Dependency compromise | High | dependency controls, scanning |
| Audit tampering | High | append-oriented audit, restricted access |

## Abuse Cases
1. User asks AI to move money/spend without permission.
2. Campaign name contains instructions intended to manipulate the model.
3. User guesses another workspace's campaign ID.
4. Attacker replays an approval request.
5. Attacker submits a forged webhook.
6. Compromised account attempts bulk campaign changes.
7. AI fabricates a successful Meta mutation.
8. Worker payload is modified before execution.

## Security Invariants
- No request crosses workspace boundary.
- No AI tool bypasses authorization.
- No action executes without valid policy state.
- No approval can be reused for a different action version.
- No credential appears in model context or logs.
- No successful response is emitted without required verification.
