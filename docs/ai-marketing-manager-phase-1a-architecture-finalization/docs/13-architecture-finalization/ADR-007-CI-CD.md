# ADR-007 — Source Control and CI/CD
**Status:** Proposed

Use GitHub + GitHub Actions.

`main` is protected. Feature branches use pull requests.

Required checks:
- lint/format
- typecheck
- unit tests
- integration/contract tests as applicable
- secret scanning
- dependency scanning
- build

AI, authorization and action-policy changes additionally run AI/security regression suites.
