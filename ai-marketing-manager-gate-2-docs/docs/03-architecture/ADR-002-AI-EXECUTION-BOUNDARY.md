# ADR-002 — AI Cannot Directly Access Meta APIs
**Status:** Proposed

## Decision
The LLM receives only typed application tools. Meta credentials and raw network access remain outside the model.

## Rationale
This creates a deterministic security and policy boundary. AI output can propose an action, but application services decide whether the action is authorized and permitted.

## Consequences
Every mutation has more explicit orchestration, validation and audit work, but the resulting system is substantially safer and testable.
