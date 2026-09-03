# Database Migration Strategy
**Document ID:** DEVOPS-007 | Version 1.0

## Rules
- migrations committed to source control
- forward migrations tested in staging
- backups before high-risk migrations
- backward-compatible expand/contract pattern for breaking schema changes
- migration status observable

## Never
Do not manually modify production schema outside the controlled migration process except documented emergency recovery procedures.
