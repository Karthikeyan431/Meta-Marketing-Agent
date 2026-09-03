# ADR-001 — Modular Monolith for MVP
**Status:** Proposed

## Context
The product has multiple domains but is initially being built by a focused development team. Premature microservices would increase operational complexity.

## Decision
Use a modular monolith for the application backend with independently scalable asynchronous workers.

## Consequences
Positive:
- faster development
- simpler local development
- simpler transactions
- lower operational overhead
- clear module boundaries can support later extraction

Negative:
- requires discipline to prevent module coupling
- one application deployment initially contains multiple domains

## Revisit
Re-evaluate when independent scaling, deployment cadence, fault isolation, or team ownership justifies service extraction.
