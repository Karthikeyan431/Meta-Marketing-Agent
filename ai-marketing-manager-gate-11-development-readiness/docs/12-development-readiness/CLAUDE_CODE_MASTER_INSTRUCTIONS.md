# Claude Code Master Development Instructions
**Document ID:** DEVREADY-002 | Version 1.0

You are implementing the AI Marketing Manager as a production-grade application.

## Before Coding
1. Inspect the repository.
2. Identify existing code, configuration and constraints.
3. Read all approved architecture documents.
4. Produce a repository assessment.
5. Identify conflicts between current code and approved architecture.
6. Do not delete or rewrite existing work without evidence.
7. Create a plan for the current phase only.

## Implementation Rules
- Follow contract-first API development.
- Keep domain logic independent from Meta provider details.
- Enforce authorization server-side.
- Enforce workspace/tenant isolation at every resource boundary.
- Use typed interfaces.
- Validate all external input.
- Treat Meta and AI as untrusted external dependencies.
- Use idempotency for side-effecting operations.
- Make asynchronous work observable and retry-safe.
- Never store secrets in source control.
- Never log access tokens or sensitive credentials.
- Write tests alongside code.
- Update documentation when behavior changes.

## AI Rules
The AI may propose actions but cannot grant itself permissions.
Tool calls must be typed, validated, authorized and policy checked.
The model must not be the source of truth for execution state.

## Meta Rules
All Meta API calls go through the Meta adapter/service.
Never call Meta directly from frontend code.
Provider errors must be normalized.
External mutation must be followed by verification where required.

## Completion
Before claiming a phase is complete:
- run relevant tests
- run lint/typecheck
- inspect changed files
- verify migrations
- verify security boundaries
- verify acceptance criteria
- report failures honestly

Do not continue to the next phase if a blocking gate fails.
