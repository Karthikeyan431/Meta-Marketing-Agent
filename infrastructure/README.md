# infrastructure

## Phase 1 scope

`docker-compose.yml` — local-only PostgreSQL + Redis for development, per §5/§6 of the
Phase 1 task. Never used for staging or production.

## Deferred

Terraform for the AWS target (ECS/Fargate, RDS, ElastiCache, S3, Secrets Manager, ALB,
WAF — ADR-006-CLOUD.md) is **not** created in Phase 1: the task's Hard Restrictions
explicitly forbid creating production AWS resources this phase, and the DevOps gate
(`docs/ai-marketing-manager-gate-10-devops-docs/`) places IaC provisioning in the
hardening/staging/production phases, not Foundation. Adding speculative Terraform now,
before any app is stable enough to deploy, would risk drifting from what Phase 11+
actually needs.
