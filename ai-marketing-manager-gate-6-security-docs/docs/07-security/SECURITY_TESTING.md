# Security Testing Strategy
**Document ID:** SEC-015 | Version 1.0

## Static
- dependency scanning
- secret scanning
- SAST
- lint/security rules

## Dynamic
- API security testing
- authentication testing
- authorization/BOLA testing
- tenant isolation tests
- CSRF/session tests where applicable
- rate-limit tests

## AI Security
Test:
- direct prompt injection
- indirect prompt injection via campaign/ad content
- malicious tool arguments
- unauthorized tool selection
- data exfiltration attempts
- excessive tool loops
- fabricated execution claims

## Financial Security
Test:
- limit bypass
- approval replay
- changed-parameter approval
- duplicate execution
- concurrent budget changes
- bulk mutation abuse

## Release Requirement
Critical security failures block release.
High-risk financial and tenant-isolation paths require automated regression tests plus manual security/UAT validation.
