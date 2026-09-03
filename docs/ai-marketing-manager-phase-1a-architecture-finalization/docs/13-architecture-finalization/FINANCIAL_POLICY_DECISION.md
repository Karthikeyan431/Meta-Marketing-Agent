# Financial Policy Decision

## Engineering Defaults
The application may implement conservative defaults listed in ADR-008:
- maximum single campaign budget increase: 10%
- maximum single budget increase: ₹5,000/day
- maximum campaigns affected per action: 1
- maximum budget-changing mutations per approval: 1
- budget increases/decreases: approval required
- campaign/ad pause: approval required initially
- bulk mutations: disabled initially
- autonomous optimization: disabled initially
- emergency stop: always available

These defaults exist so Phase 1–8 engineering work (schema, policy-engine plumbing, UI for limits) has something concrete to build against. **They are not authorized spend limits** — no controlled AI action may execute against real ad spend on the strength of these defaults alone (see Hard Rule, below).

## Business Approval Required
Before controlled AI actions are enabled, the owner must approve:
- maximum budget increase amount
- maximum percentage increase
- daily action limits
- bulk-action rules
- campaign pause rules
- account-level limits
- approval thresholds
- emergency-stop ownership

## Hard Rule
Undefined policy means the action is blocked, not guessed.

## Phase 1A validation note
Checked against Gate 1 `BUSINESS_RULES.md` BR-005/BR-006/BR-007 (autonomous execution off by default, bounded, fail-closed) and BR-017 (changing a financial limit is itself a privileged, authorized operation) — consistent, no conflict. Still **pending**: the actual owner-approved numeric values above; this document records the separation of concerns, not an approval.
