# Environment Strategy
**Document ID:** DEVOPS-002 | Version 1.0

## Environments
### Local
Developer workstation; synthetic credentials/data.

### Development
Shared integration environment; safe test integrations.

### Staging
Production-like architecture; release candidate validation.

### Production
Real users and real Meta accounts.

## Rules
- Environment-specific secrets only.
- No production credentials in local/development.
- Staging must not spend real advertising budget through automated tests.
- Production access is least-privilege and audited.
