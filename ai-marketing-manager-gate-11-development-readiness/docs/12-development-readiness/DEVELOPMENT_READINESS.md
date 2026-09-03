# AI Marketing Manager — Development Readiness Package
**Document ID:** DEVREADY-001 | Version 1.0 | Status: Ready for Implementation

## Purpose
This package converts the approved SDLC gates into an executable development plan for Claude Code in VS Code.

## Non-Negotiable Principles
- Do not skip architecture decisions.
- Do not invent business rules when a requirement exists.
- Do not expose Meta credentials to the browser.
- Do not allow AI to bypass authorization or approval policy.
- Do not report an external action as successful without verification.
- Maintain tenant isolation on every protected resource.
- Every production-impacting mutation must be auditable.
- Add tests with implementation, not after implementation.

## Definition
Claude Code is the implementation assistant. It must inspect the repository, understand this package, implement one phase at a time, run the required checks, report results, and stop at phase gates.
