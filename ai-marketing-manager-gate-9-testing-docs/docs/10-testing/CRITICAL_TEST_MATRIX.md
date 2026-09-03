# Critical Test Matrix
**Document ID:** TEST-003 | Version 1.0

| Area | Critical Cases | Release Blocking |
|---|---|---|
| Authentication | login, logout, expiry, recovery | Yes |
| Authorization | role + object access | Yes |
| Tenant isolation | cross-workspace access | Yes |
| Meta OAuth | connect/reconnect/disconnect | Yes |
| Campaign reads | correct account scope | Yes |
| Campaign mutations | validation/policy/execution | Yes |
| Spend controls | limit bypass attempts | Yes |
| Approvals | replay/change/expiry | Yes |
| AI tools | unauthorized tool attempts | Yes |
| Prompt injection | malicious external text | Yes |
| Webhooks | authenticity/deduplication | Yes |
| Reports | metric correctness | Yes |
| Search | entity resolution/navigation | Yes |
| Failure recovery | provider outage/retry | Yes |
| Audit | complete action trail | Yes |
