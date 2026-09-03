# CI/CD Architecture
**Document ID:** DEVOPS-005 | Version 1.0

## Pipeline

```text
Commit
 ↓
Lint / Typecheck
 ↓
Unit Tests
 ↓
Security / Secret Scan
 ↓
Build
 ↓
Integration / Contract Tests
 ↓
AI Regression (when applicable)
 ↓
Deploy Dev
 ↓
E2E
 ↓
Deploy Staging
 ↓
Release Approval
 ↓
Production
 ↓
Smoke Test
```

## Rules
- Protected main branch.
- Required checks before merge.
- Build once, promote the same artifact where practical.
- Deployment credentials use short-lived/federated access where supported.
