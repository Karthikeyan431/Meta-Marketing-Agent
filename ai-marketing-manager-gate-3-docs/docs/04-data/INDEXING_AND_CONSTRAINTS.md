# Indexing and Constraints
**Document ID:** DATA-005 | **Version:** 1.0

## Required Index Patterns
Tenant-owned high-volume tables should generally index:
- workspace_id
- workspace_id + status
- workspace_id + external_id
- parent_id + external_id
- timestamps for job/audit/insight queries

## Insights
Indexes must reflect the most common query dimensions:
- workspace + date
- ad account + date
- campaign + date
- campaign/ad set/ad + date as required

## Constraints
Use database constraints for:
- foreign keys
- unique external identity
- valid lifecycle values where practical
- non-negative monetary values where applicable
- valid timestamps
- required workspace ownership

## Idempotency
Unique constraints should protect idempotent operations where possible, especially:
- synchronization records
- webhook event identifiers
- action idempotency keys
- external object identity

## Performance Rule
Indexes must be introduced based on actual access patterns and query plans; avoid indexing every column.
