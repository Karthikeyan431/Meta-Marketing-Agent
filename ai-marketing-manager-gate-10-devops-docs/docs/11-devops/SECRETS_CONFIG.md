# Secrets and Configuration Management
**Document ID:** DEVOPS-008 | Version 1.0

## Secrets
Store in a managed secret system where possible:
- Meta credentials/tokens
- AI provider credentials
- database credentials
- signing secrets
- webhook verification secrets

## Configuration
Non-secret environment configuration is versioned and validated.

## Rules
- never commit secrets
- never print secrets in logs
- rotate credentials
- use separate secrets per environment
- minimize secret access by service
