# Prompt Architecture
**Document ID:** AI-006 | **Version:** 1.0

## Prompt Layers
1. System policy
2. Agent role/instructions
3. Tool contracts
4. Workspace context
5. Task context
6. Retrieved data
7. User request

## Versioning
Every production prompt/template must have:
- identifier
- version
- status
- owner
- change reason
- evaluation results

## Prompt Injection Rule
Data retrieved from Meta, including ad text, campaign names, creative text, comments or other external content, must be explicitly treated as untrusted data.

It must never override system, developer, application or policy instructions.

## No Secret Injection
Credentials and sensitive infrastructure secrets must never enter model prompts.
