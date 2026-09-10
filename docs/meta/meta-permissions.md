# Meta Permission Matrix

**Document ID:** META-103 | Version 1.0 | Status: Draft for Owner Approval | Phase: 3A (Architecture Finalization)

Live-verified 2026-09-10 against `developers.facebook.com/docs/permissions/reference/ads_read`,
`.../ads_management`, `.../business_management` (all three directly fetched). Supersedes the
2026-09-04 findings recorded in `docs/ai-marketing-manager-phase-1a-architecture-finalization/
docs/13-architecture-finalization/TECH_STACK.md` for permission names — the names are
unchanged between the two verification passes, confirming stability, but this document is now
the authoritative current record per the governing task's explicit "treat prior research as
historical, re-verify" instruction.

## 1. Verified Permission Matrix

| Permission            | Purpose                                                                           | Read/Write   | Required Meta capability      | App Review | Business Verification     | Production requires it?                                                                               | Feature(s) that depend on it                                                               | Least-privilege alternative                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------- | ------------ | ----------------------------- | ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ads_read`            | Read-only ad performance/report data + Server-Side API events                     | Read         | Ad account reporting access   | **Yes**    | **Yes** (Advanced Access) | Yes, for any account the workspace only reads (no mutation intent)                                    | `meta_connection.read`, insights sync, read-only dashboards                                | None narrower exists for ad performance data; this already is the minimal read scope                                                                                         |
| `ads_management`      | Read **and** manage/create/edit campaigns, ad sets, ads on owned/granted accounts | Read + Write | Ad account management access  | **Yes**    | **Yes** (Advanced Access) | Yes, for any account the workspace intends to mutate (pause/budget/create)                            | `campaign.update`, `campaign.pause`, `campaign.create` (once implemented — not this phase) | `ads_read` alone, if the workspace's account never needs mutation (many workspaces may start read-only)                                                                      |
| `business_management` | Read/write Business Manager API; manage/claim ad accounts                         | Read + Write | Business Manager asset access | **Yes**    | **Yes**                   | Yes, for account **discovery** across a Business (not needed for a single directly-shared ad account) | `meta-account-discovery.md`'s Business-scoped discovery flow                               | Skip entirely if V1 only supports connecting a single, directly-authorized ad account rather than discovering across a Business — see `phase-3-owner-decision-package.md` §2 |

**Dependency note (live-verified, not in the 2026-09-04 pass):** both `ads_management` and
`business_management` depend on `pages_read_engagement` + `pages_show_list` per Meta's current
permission-reference pages. This is a new finding this verification pass surfaced — Phase 3.1
must request these two dependency permissions alongside `ads_management`/`business_management`,
or Meta's App Review/authorization will reject the request. Neither dependency grants any
capability this application needs beyond satisfying the requirement; they are not independently
useful and should not be treated as unlocking a Pages feature.

## 2. Least-Privilege Recommendation for V1

Per design principle 7 (`meta-architecture.md` §1) and the operations matrix
(`ai-marketing-manager-gate-5-docs/docs/06-meta/META_OPERATIONS_MATRIX.md`, which marks nearly
every mutation category "Execute-MVP: Required initially [approval]" rather than unrestricted),
the minimal permission set for a V1 that supports read + status/budget mutation with approval
is `ads_read` + `ads_management` (+ their two dependency permissions). `business_management` is
only required if V1 supports multi-account discovery across a Business rather than a single
directly-authorized ad account — this is an explicit owner decision
(`phase-3-owner-decision-package.md` §2), not assumed here.

## 3. Do Not Request Speculatively

Consistent with "Do not request permissions merely because they might be useful later"
(governing task) and BR-014 ("unsupported Meta operations must be rejected clearly, not
approximated"), no permission beyond the three above is evaluated in this document. If a
future phase needs Pages, Instagram, catalog, or pixel access, that phase must independently
verify the then-current permission name/requirements — do not assume this matrix still applies
unchanged, per the same re-verification discipline this phase itself followed.

## 4. Reconciliation Against the Already-Shipped RBAC Catalog

`packages/domain/src/rbac-catalog.ts` already seeds (Phase 2.3/2.4A, tested, CI-verified):

```
meta_connection.read       → ALL_ROLES
meta_connection.connect    → OWNER_ADMIN
meta_connection.reconnect  → OWNER_ADMIN
meta_connection.disconnect → OWNER_ADMIN
campaign.read               → ALL_ROLES
campaign.create              → MANAGE_ROLES (OWNER/ADMIN/MANAGER)
campaign.update               → MANAGE_ROLES
campaign.pause                → MANAGE_ROLES
campaign.delete                → OWNER_ADMIN
```

These application-level permissions are **independent of, and layered above**, the Meta-side
permission scopes in §1 — an OWNER holding `meta_connection.connect` still cannot connect an
account the Meta OAuth grant didn't actually authorize, and a MANAGER holding `campaign.update`
still cannot mutate a campaign if the connected account's Meta-side `ads_management` grant was
revoked (see `meta-connection-health.md`'s `REAUTH_REQUIRED`/`REVOKED` states). This matrix does
not propose changing the RBAC catalog — no new permission, no new role. See
`docs/identity/permission-catalog.md`'s existing "Meta Connection"/"Campaigns" sections for the
already-recorded AI-invocable/worker-invocable classification of each permission, restated in
`meta-oauth.md` §7 and `meta-threat-model.md` §"AI boundary".
