# Meta Object and Identity Model
**Document ID:** META-003 | Version 1.0

## Canonical Hierarchy

```text
Meta Business / Access Context
        ↓
     Ad Account
        ↓
     Campaign
        ↓
      Ad Set
        ↓
       Ad
        ↓
    Creative
```

Other assets such as Pages, Instagram assets, catalogs and audiences should be modeled only when their supported product workflows require them.

## Identity
Every external entity needs:
- internal ID
- workspace ID
- Meta external ID
- parent internal ID
- source/provider
- status
- source_updated_at
- last_synced_at

## Rules
- Meta IDs are not primary authorization keys.
- External names are mutable and cannot be unique identity.
- Parent relationships must be validated.
- Cross-workspace external IDs must never resolve to a tenant's resource.

## Entity Resolution
Natural-language queries must search the canonical internal index within the authorized workspace and then use Meta IDs only for external operations.
