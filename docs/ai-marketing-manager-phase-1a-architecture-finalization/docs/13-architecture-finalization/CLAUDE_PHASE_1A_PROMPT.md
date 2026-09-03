# Claude Code — Phase 1A Architecture Finalization

Phase 0 is complete. The repository contains SDLC documentation and no application source code.

Read the complete SDLC corpus plus:
- `docs/implementation/repository-assessment.md`
- `docs/implementation/implementation-plan.md`
- `docs/13-architecture-finalization/*`

## Do not build the application yet.

### Tasks
1. Initialize Git if absent.
2. Validate ADR-001 through ADR-010 against the complete SDLC corpus.
3. Identify conflicts and decisions that require explicit owner approval.
4. Verify the current official Meta Graph API version and relevant Marketing API capabilities using current official Meta documentation. Do not guess. Record the verification date and evidence.
5. Create/update:
   - `TECH_STACK.md`
   - `SECURITY_BOUNDARY.md`
   - `EXTERNAL_DEPENDENCIES.md`
   - `FINANCIAL_POLICY_DECISION.md`
6. Update the Architecture Decision Register.
7. Separate engineering defaults from business-approved financial policy.
8. Do not scaffold frameworks, install dependencies, create schemas, implement auth, Meta OAuth, AI, or infrastructure.

## Final report
Return:
- accepted decisions
- pending decisions
- Meta findings
- financial policy gaps
- conflicts
- files changed
- verification performed
- blockers

STOP after Phase 1A.
