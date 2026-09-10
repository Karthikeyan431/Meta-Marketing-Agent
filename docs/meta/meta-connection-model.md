# Meta Connection Entity Model

**Document ID:** META-105 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Conceptual entity design only — **no Prisma migration is created by this document**, per the
governing task's explicit restriction. Reconciled against
`ai-marketing-manager-gate-3-docs/docs/04-data/SCHEMA_DESIGN.md` (DATA-003)'s existing
field-level `meta_connections` design and `.../ERD_SPECIFICATION.md` (DATA-002).

## 1. Fields (evaluated, not finalized as a schema)

| Field                                   | Sensitivity                                                                                                             | Exposable via API?                                                                                                                                                                                                        | Notes                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                    | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Internal primary key — the only ID clients should ever address this resource by (`meta-resource-model.md` §1).                                                                                 |
| `workspaceId`                           | Not sensitive (already an authorization dimension)                                                                      | Yes                                                                                                                                                                                                                       | Foreign key to the existing `Workspace` table — every query scoped through this, mirroring `WorkspaceMembership`'s pattern.                                                                    |
| `provider`                              | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Fixed `"meta"` for now — exists so a future non-Meta ad provider doesn't require a new table.                                                                                                  |
| Meta user/business identity             | Not sensitive on its own, but never used as an authorization key (`meta-resource-model.md` §2)                          | Yes, for display only                                                                                                                                                                                                     | The external Meta user or Business ID the connection was authorized against.                                                                                                                   |
| Encrypted credential reference          | **Sensitive — never exposed**                                                                                           | No                                                                                                                                                                                                                        | A reference into the secret-storage mechanism (`meta-token-security.md` §2), never the raw ciphertext or plaintext token itself, in this table.                                                |
| Token metadata (expiry, scopes granted) | Sensitive (scopes list; expiry is lower-sensitivity but still not casually exposed)                                     | Partial — expiry/health-relevant fields only, never the scope list verbatim if it could aid an attacker's reconnaissance, though this is a low-severity concern; default to not exposing unless a concrete UI need arises | Drives `meta-token-security.md` §3's state model.                                                                                                                                              |
| `status`                                | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | One of the 5 states in `meta-token-security.md` §3.                                                                                                                                            |
| `lastValidatedAt`                       | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Drives `meta-connection-health.md`'s freshness display.                                                                                                                                        |
| `lastSuccessfulApiCallAt`               | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Distinct from `lastValidatedAt` — a successful real operation, not just a health probe.                                                                                                        |
| Granted scopes                          | Sensitive-adjacent (see above)                                                                                          | No, by default                                                                                                                                                                                                            | The actual permission scopes Meta granted (§`meta-permissions.md` §1) — needed internally to gate which operations are attempted, not necessarily surfaced raw to the client.                  |
| `createdAt` / `updatedAt`               | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Standard.                                                                                                                                                                                      |
| `disconnectedAt`                        | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Nullable — set once, on disconnect; preserved, not deleted, per BR-018.                                                                                                                        |
| Error state                             | Not sensitive (should never itself contain raw provider error bodies with sensitive content — `meta-error-model.md` §5) | Yes, normalized only                                                                                                                                                                                                      | The last normalized error category (`meta-error-model.md`), not a raw Meta error blob.                                                                                                         |
| Connection version                      | Not sensitive                                                                                                           | Yes                                                                                                                                                                                                                       | Increments on reconnection — lets clients/AI distinguish "the same logical connection, refreshed" from "a genuinely new connection," relevant for cache/UI invalidation and audit correlation. |

## 2. Reconciliation Against `SCHEMA_DESIGN.md`'s Existing Field List

`SCHEMA_DESIGN.md` (DATA-003, Gate 3) already specifies `meta_connections`: `id, workspace_id,
provider, external_business_id, encrypted credential reference, token expiry, status,
last_validated_at`, with a uniqueness note ("should prevent duplicate active connection
identity"). This document's field list above is a superset — it adds `lastSuccessfulApiCallAt`,
granted-scopes tracking, `disconnectedAt`, normalized error state, and a connection version
counter, all of which are needed to satisfy the health-state model (`meta-token-security.md`
§3) and the audit/verification requirements (`meta-architecture.md` §5,
`meta-error-model.md` §4) that this phase's broader research surfaced. No field from
`SCHEMA_DESIGN.md`'s original list is removed or contradicted — this is an additive
reconciliation, to be finalized as an actual Prisma model only in Phase 3.2.

## 3. Related Entities Named in `ERD_SPECIFICATION.md` (DATA-002), Not Modeled Here

`ERD_SPECIFICATION.md` additionally names `sync_runs`, `webhook_events`, and
`external_entity_mappings` as related integration-tracking tables. These belong to
`meta-sync.md` and `meta-webhooks.md`'s conceptual scope (Phase 3.4/3.6), not this connection
entity — named here only so a future phase doesn't rediscover them as a gap. `ad_accounts` is
its own entity, evaluated in `meta-resource-model.md` §3, related to `MetaConnection` via
`meta_connection_id` per `SCHEMA_DESIGN.md`.

## 4. Uniqueness (conceptual, not a migration constraint yet)

A workspace should not be able to hold two simultaneously-`ACTIVE` `MetaConnection` rows for
the same external Meta business/user identity — this is the "prevent duplicate active
connection identity" rule `SCHEMA_DESIGN.md` already flags. Reconnection (`meta-token-security.md`
§5) updates the existing row rather than creating a second one. Whether a single workspace may
hold connections to **multiple distinct** Meta Business identities (not duplicates, genuinely
different businesses) is an open product question — see `phase-3-owner-decision-package.md` §3
("multiple account support").

## 5. Authorization Boundary (restates `meta-architecture.md` §2, not a new rule)

Every query against `MetaConnection` and everything beneath it in the hierarchy
(`meta-resource-model.md`) is scoped by `workspaceId`, resolved server-side from the
already-authorized `requireWorkspaceMembership()` chain — never a client-suppliable value,
exactly matching every resource-authorization pattern already shipped in this codebase
(`requireResourceAccess()`, Phase 2.3–2.6).
