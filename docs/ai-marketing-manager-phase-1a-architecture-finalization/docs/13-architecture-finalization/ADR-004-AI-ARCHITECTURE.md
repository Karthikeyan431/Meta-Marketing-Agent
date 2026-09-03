# ADR-004 — AI Provider and Orchestration
**Status:** Proposed

Use an internal `AIProvider` abstraction with OpenAI as the initial provider.

The application, not the model, owns:
- authorization
- tool schemas
- policy checks
- approval
- execution state
- audit
- verification

AI output is never a security boundary or source of execution truth.
