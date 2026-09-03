# CI Quality Gates
**Document ID:** TEST-011 | Version 1.0

## Pull Request
Required:
- formatting/lint
- type checks
- unit tests
- relevant integration tests
- secret scan
- dependency/security scan

## Merge / Main
Required:
- broader integration suite
- contract validation
- AI regression suite for AI changes
- build verification

## Release Candidate
Required:
- E2E
- security suite
- performance smoke
- Meta integration smoke
- migration validation

## Production
No unresolved Critical issues and no unapproved High-risk findings.
