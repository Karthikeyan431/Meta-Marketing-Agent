# AI Security and Prompt Injection Defense
**Document ID:** SEC-007 | Version 1.0

## Threat Model
External Meta data can contain attacker-controlled strings:
- campaign names
- ad copy
- creative text
- URLs
- imported metadata
- other provider content

Treat these as DATA, never instructions.

## Prompt Construction
Use explicit boundaries:

```text
SYSTEM POLICY
AGENT RULES
TOOL CONTRACTS
AUTHORIZED CONTEXT
UNTRUSTED EXTERNAL DATA
USER REQUEST
```

The model must not be allowed to redefine higher-priority rules.

## Tool Security
- minimum necessary tools
- typed arguments
- strict schemas
- allowlisted operations
- server-side authorization
- server-side policy checks
- bounded execution
- no arbitrary HTTP
- no arbitrary SQL
- no shell/code execution

OWASP identifies excessive agency as a major agentic AI risk; minimizing functionality, permissions and autonomy is therefore mandatory.

## Output Security
Validate structured model outputs before use.

Never directly execute:
- model-generated SQL
- model-generated HTTP requests
- model-generated shell commands
- arbitrary provider API paths

## Data Exfiltration
The agent must not be able to use a legitimate tool to intentionally retrieve unrelated secrets or cross-tenant data.
