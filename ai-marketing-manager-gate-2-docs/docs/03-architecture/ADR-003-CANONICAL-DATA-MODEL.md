# ADR-003 — Canonical Internal Data Model
**Status:** Proposed

## Decision
Maintain an internal normalized model for users, workspaces, Meta accounts, campaigns, entities, metrics, actions, goals and audit events.

## Rationale
Directly coupling product logic to Meta object shapes makes future integrations and API-version changes expensive.

## Consequences
Synchronization must map external objects into canonical entities and preserve external IDs for reconciliation.
