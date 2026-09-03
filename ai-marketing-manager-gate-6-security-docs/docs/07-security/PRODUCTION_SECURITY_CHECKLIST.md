# Production Security Checklist
**Document ID:** SEC-016 | Version 1.0

## Identity
- [ ] Strong authentication configured
- [ ] MFA/step-up strategy configured
- [ ] Session security verified
- [ ] Recovery flows tested

## Authorization
- [ ] RBAC permissions defined
- [ ] Object-level authorization tested
- [ ] Tenant isolation tested
- [ ] Worker authorization tested

## Secrets
- [ ] Secret manager/KMS configured
- [ ] Meta credentials encrypted
- [ ] No secrets in logs
- [ ] Rotation procedure tested

## AI
- [ ] Typed tools only
- [ ] Prompt injection defenses tested
- [ ] Model output validation enabled
- [ ] AI cannot bypass policy
- [ ] AI cannot access secrets
- [ ] Tool limits configured

## Financial
- [ ] Spend limits configured
- [ ] Approval thresholds configured
- [ ] Idempotency enabled
- [ ] Emergency stop tested
- [ ] Verification enabled

## Operations
- [ ] Audit logs enabled
- [ ] Security alerts configured
- [ ] Incident runbook approved
- [ ] Backups verified
- [ ] Restore procedure tested
