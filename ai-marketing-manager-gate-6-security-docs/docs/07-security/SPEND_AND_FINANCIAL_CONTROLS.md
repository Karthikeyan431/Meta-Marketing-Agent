# Advertising Spend and Financial Controls
**Document ID:** SEC-010 | Version 1.0

## Principle
Treat advertising budget changes as financial-impacting operations.

## Controls
- per-action maximum change
- percentage change limit
- daily workspace limit
- account-level limit
- campaign-level limit
- bulk-action limit
- cooldown period
- approval threshold
- emergency stop
- idempotency
- post-action verification

## Example
A request to increase campaign budget by 500% should not execute merely because the AI understood the sentence correctly. Deterministic policy must reject or route it for stronger approval.

## Autonomous Optimization
Autonomous execution must be bounded by preconfigured limits and cannot modify its own limits.
