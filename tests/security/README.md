# tests/security

Deep security testing (BOLA/IDOR, tenant isolation, prompt injection, auth bypass —
`SECURITY_TESTING.md`) needs real authorization, tenant, and AI surfaces to attack, none
of which exist yet. Phase 1's security baseline (helmet headers, rate limiting, CORS,
body size limits, error-envelope safety) is instead verified directly in
`tests/integration/api-health.test.ts`. This folder gains real content starting with
Phase 2 (tenant isolation negative tests) and grows through Phase 11 (Reliability &
Security Hardening), which owns the full `SECURITY_TESTING.md` suite.
