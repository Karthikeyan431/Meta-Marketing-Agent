# External Dependencies

## Required
- Meta platform/Marketing APIs — version verified live 2026-09-04, see `TECH_STACK.md` (v25.0 recommended initial target, v26.0 latest available). Requires Meta App Review before production for `ads_management`, `ads_read`, `business_management`.
- AI provider — OpenAI (ADR-004 initial target), accessed only through an internal `AIProvider` abstraction so the provider can be swapped without touching orchestration logic.
- Identity provider — **not yet selected.** ADR-002 specifies "an external identity provider" as a pattern but names no vendor. This is an open sub-decision that must be resolved before Phase 2 (Identity & Multi-Tenancy) begins; see conflicts/pending list in the Phase 1A report.
- AWS services — ECS/Fargate, RDS PostgreSQL, ElastiCache Redis, S3, Secrets Manager, ALB, WAF, managed DNS (ADR-006).
- GitHub / GitHub Actions — source control and CI/CD (ADR-007).

## Dependency Rules
- wrap providers behind internal interfaces
- validate external responses
- normalize provider errors
- implement timeouts/retries safely
- monitor quotas/rate limits
- pin versions where supported
- maintain upgrade procedures
- never make external dependency availability the application's security boundary

## Data-Sharing Note (new — raised during Phase 1A validation)

Sending Meta-derived workspace/campaign data to a third-party AI provider (OpenAI, per ADR-004) as model context is a data-processing relationship the SDLC corpus does not address anywhere — no document in Gates 0–11 names a compliance framework (GDPR/CCPA/SOC 2/PCI) or a data-processing-agreement requirement for any external provider. Before Phase 8 (AI Read-Only) sends real workspace data to the chosen AI provider, the project owner should confirm: acceptable data-sharing scope with the AI provider, whether a DPA/BAA-equivalent is required, and any data-residency constraint. This is a business/legal decision, not an engineering one, and is not resolved by ADR-004 choosing OpenAI as the initial provider.
