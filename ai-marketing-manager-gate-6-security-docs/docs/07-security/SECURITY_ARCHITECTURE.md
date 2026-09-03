# AI Marketing Manager — Security Architecture
**Document ID:** SEC-001 | Version 1.0 | Status: Draft for Approval

## 1. Security Objective
Protect customer advertising accounts, campaign data, credentials, advertising spend, AI actions and tenant data while maintaining a usable chat-first experience.

Security design follows defense-in-depth and least privilege. OWASP ASVS is used as the application-security verification baseline; Level 2 is the target baseline for production, with stronger controls applied to high-risk functions. OWASP ASVS covers architecture, authentication, sessions, access control, cryptography, data protection, APIs and business logic.

## 2. Trust Boundaries

```text
[User Browser]
      |
      | HTTPS
      v
[Edge / API]
      |
      +---- [Identity/Auth]
      |
      v
[Application Services]
      |
      +---- [Authorization]
      +---- [Policy Engine]
      +---- [AI Orchestrator]
      |          |
      |          +---- [Typed Tools]
      |
      +---- [Audit]
      |
      +---- [Meta Integration]
                   |
                   v
               [Meta APIs]

Separate trusted zones:
- production secrets
- database
- background workers
- observability
```

## 3. Core Security Principles
1. Never trust client-supplied authorization claims.
2. Enforce authorization server-side.
3. Enforce workspace/tenant scope on every data access.
4. Minimize AI permissions and tool surface.
5. Separate proposal from execution.
6. Protect credentials as secrets.
7. Validate all external and AI-generated input.
8. Log security-relevant events without logging secrets.
9. Fail closed for high-risk operations.
10. Verify external mutations before reporting success.

OWASP's current GenAI security guidance identifies prompt injection and excessive agency as major risks; this architecture directly addresses both by treating external content as untrusted and placing deterministic controls around AI tools and actions.

## 4. Security Levels
### Standard
Read-only analytics, reports, searches.

### Elevated
Campaign state and configuration changes.

### High Risk
Budget/spend changes, bulk mutations, autonomous optimization and other actions with material financial impact.

High-risk actions require stronger policy and approval controls.
