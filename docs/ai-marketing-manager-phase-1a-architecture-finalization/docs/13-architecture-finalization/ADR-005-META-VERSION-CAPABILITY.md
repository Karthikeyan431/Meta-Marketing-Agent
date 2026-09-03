# ADR-005 — Meta API Version and Capability Management
**Status:** Pending live verification

Do not guess or permanently pin a Meta Graph API version from this document.

Before implementation:
1. Verify the current official Meta Graph API version.
2. Verify Marketing API read capabilities.
3. Verify campaign/ad set/ad mutation capabilities.
4. Verify Insights metrics and requirements.
5. Verify OAuth scopes and business requirements.
6. Record evidence and verification date.
7. Pin the verified version in configuration.
8. Add adapter contract tests and an upgrade procedure.

Production spend mutations remain disabled until this matrix is verified.
