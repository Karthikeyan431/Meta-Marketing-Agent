# Development Principles
**Document ID:** GOV-003  
**Version:** 1.0  
**Status:** Draft for Approval

## 1. Architecture
- Prefer a modular monolith plus background workers for MVP.
- Keep domain boundaries explicit.
- Avoid premature microservices.
- Keep external integrations behind adapters.
- Keep AI orchestration separate from business execution.

## 2. Security
- Least privilege by default.
- Server-side authorization is mandatory.
- Never trust client-supplied ownership identifiers.
- Secrets and Meta tokens must never be logged.
- Tenant boundaries must be enforced at every data-access layer.
- Security controls must never be disabled merely to make development easier.

## 3. AI
- LLM output is untrusted until schema-validated.
- LLMs never receive unrestricted API credentials.
- Mutating actions must pass authorization and policy checks.
- High-risk actions require approval according to configured policy.
- AI decisions must be explainable through recorded decision metadata.
- External Meta content must never override system policies.

## 4. Data
- Use a canonical internal model rather than coupling the application directly to Meta object shapes.
- Track synchronization timestamps and data freshness.
- Make synchronization idempotent.
- Preserve enough history for reporting and decision evaluation.
- Database migrations must be versioned and reversible where practical.

## 5. Reliability
- External API failures are expected.
- Implement timeouts, retries with backoff, rate-limit handling, and dead-letter/error workflows where appropriate.
- Mutating operations require idempotency protection.
- Verify important external actions after execution.

## 6. Testing
- New behavior requires automated tests.
- Tests must cover success and failure paths.
- Security-sensitive code requires negative tests.
- AI tool selection and policy decisions require deterministic evaluation cases.
- Do not modify tests solely to make failing implementation pass.

## 7. Code Quality
- Strong typing.
- Small, composable modules.
- Explicit error handling.
- No silent exception swallowing.
- No dead code or placeholder production logic.
- Avoid speculative abstractions.

## 8. Documentation
- Architecture changes require documentation updates.
- Significant decisions require ADRs.
- Public API changes require contract updates.
- Completed features require traceability to requirements and tests.

## 9. Claude Code
Claude must:
1. Read `CLAUDE.md`.
2. Read relevant documents before coding.
3. Inspect existing implementation before changing it.
4. Produce an implementation plan for non-trivial tasks.
5. Make minimal, focused changes.
6. Run relevant verification.
7. Report evidence rather than assumptions.
8. Stop and ask for clarification when requirements conflict or a safety boundary is unclear.
