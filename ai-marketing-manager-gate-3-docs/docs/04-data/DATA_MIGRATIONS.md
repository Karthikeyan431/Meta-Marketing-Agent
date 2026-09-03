# Database Migration Strategy
**Document ID:** DATA-008 | **Version:** 1.0

## Rules
- All schema changes use versioned migrations.
- Never edit an already-applied migration.
- Prefer backward-compatible changes for rolling deployments.
- Separate destructive migrations into explicit stages.
- Large backfills run asynchronously.
- Production migrations require backup/recovery consideration.

## Migration Sequence
1. Add new structure.
2. Deploy compatible application.
3. Backfill.
4. Validate.
5. Switch reads/writes.
6. Remove old structure only after safe observation.

## Verification
Every migration should have:
- local application
- test database validation
- rollback/forward strategy
- performance consideration
- production execution plan for high-risk changes
