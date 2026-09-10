# Meta Account Discovery

**Document ID:** META-106 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

## 1. Scope for V1

Consistent with the governing task's "Do not implement unrelated assets simply because Meta
exposes them — focus the first implementation on advertising operations required by the
product": V1 discovery covers **Businesses** (only if `business_management` is in scope — see
`phase-3-owner-decision-package.md` §2) and **Ad Accounts**. Pages, pixels, and catalogs are
explicitly out of scope for V1 discovery — `ai-marketing-manager-gate-5-docs/docs/06-meta/
META_OBJECT_MODEL.md`'s own principle already states this: "Other assets such as Pages,
Instagram assets, catalogs and audiences should be modeled only when their supported product
workflows require them." No workflow requiring them exists yet in this project's roadmap.

## 2. Discovery Flow

```
Token validated (meta-oauth.md)
  ↓
List authorized Businesses (if business_management granted) or directly-shared Ad Accounts
  ↓
For each candidate: fetch minimal identifying fields (external ID, name, currency, timezone, status)
  ↓
Normalize into a discovery result set (never persisted yet — this is a read, not a mutation)
  ↓
Present to user for selection
  ↓
User selects one or more Ad Accounts
  ↓
Persist selected Ad Accounts, associated with the workspace's MetaConnection (meta-connection-model.md)
  ↓
Initial sync begins (meta-sync.md §1)
```

## 3. Normalization & Deduplication

Every discovered Ad Account is normalized to the field set in `meta-resource-model.md` §3
before persistence. Deduplication key: `workspaceId + external Ad Account ID` (unique
constraint, per `meta-resource-model.md` §4/`SCHEMA_DESIGN.md`'s existing `workspace_id +
external_id` uniqueness rule for `ad_accounts`) — re-running discovery for an already-connected
account updates the existing row (name, currency, timezone, status refresh) rather than
creating a duplicate.

## 4. Account Selection / Deselection / Re-sync

- **Selection**: the user explicitly chooses which discovered Ad Account(s) to connect —
  discovery itself never auto-connects an account merely because it was found. This matches
  BR-002 ("A Meta asset may be operated only if the workspace has a valid authorized
  connection") — discovery precedes authorization-for-use, it is not itself authorization.
- **Deselection**: removing a previously-selected Ad Account stops its sync
  (`meta-sync.md`) but, per BR-018's audit-preservation principle (already applied to
  connection disconnect in `meta-oauth.md` §6), does not delete its historical synced data —
  it is marked inactive/disconnected, not purged.
- **Re-sync**: re-running discovery after a reconnection (`meta-token-security.md` §5)
  reconciles the account list against what's currently authorized on Meta's side — an account
  the user removed access to on Meta's end (revoked at the Business level, not disconnected
  through this application) should surface as no longer discoverable, which the connection
  health model (`meta-connection-health.md`) must reflect.

## 5. Authorization

`GET`-shaped discovery calls require `meta_connection.read` (already seeded, `ALL_ROLES`);
persisting a selected Ad Account (a mutation — creating a local `AdAccount` row) requires
`meta_connection.connect` (already seeded, `OWNER_ADMIN` only) since it is part of the
connection-establishment flow, not a separate lesser-privileged action. This does not require
a new permission — reuses the existing catalog exactly, consistent with
`meta-architecture.md`'s reuse principle.
