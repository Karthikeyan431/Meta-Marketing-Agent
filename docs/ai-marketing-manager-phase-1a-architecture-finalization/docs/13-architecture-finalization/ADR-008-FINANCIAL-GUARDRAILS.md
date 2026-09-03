# ADR-008 — Initial Financial Safety Guardrails
**Status:** Engineering defaults; owner approval required before controlled actions

Conservative initial defaults:
- maximum single campaign budget increase: 10%
- maximum single budget increase: ₹5,000/day
- maximum campaigns affected per action: 1
- maximum budget-changing mutations per approval: 1
- budget increases: approval required
- budget decreases: approval required
- campaign/ad pause: approval required initially
- bulk mutations: disabled initially
- autonomous optimization: disabled initially
- emergency stop: always available

These are engineering defaults, not business approval. Final thresholds must be explicitly approved before Phase 9.
