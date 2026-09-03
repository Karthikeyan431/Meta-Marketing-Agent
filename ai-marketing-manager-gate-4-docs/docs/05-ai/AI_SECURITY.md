# AI Security
**Document ID:** AI-007 | **Version:** 1.0

## Threats
- prompt injection
- malicious campaign/ad text
- indirect prompt injection
- tool argument manipulation
- excessive agency
- data exfiltration
- cross-tenant context leakage
- hallucinated execution
- tool-loop abuse
- denial-of-wallet/cost abuse

## Controls
### Prompt Injection
Treat external content as untrusted. Keep policy outside model-controlled text.

### Excessive Agency
Expose only minimum required typed tools.

### Authorization
Every tool call is re-authorized server-side.

### Data Leakage
Context retrieval is workspace-scoped and least-privilege.

### Cost Abuse
Apply per-user/workspace request and token budgets.

### Tool Abuse
Limit tool count, execution duration and mutation frequency.

### Hallucination
Require authoritative tool results for factual business claims.

### Execution
Require deterministic action validation and verification.

## Security Principle
Assume the model can be wrong or manipulated; the application must remain safe anyway.
