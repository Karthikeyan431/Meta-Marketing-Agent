# Pagination, Filtering and Sorting
**Document ID:** API-004 | Version 1.0

## Pagination
Prefer cursor pagination for large/volatile collections.

Example:
`?limit=50&cursor=...`

Requirements:
- bounded maximum limit
- stable cursor
- no client-controlled database offset abuse

## Filtering
Only allow documented fields/operators.

Example:
`?status=ACTIVE`

Never translate arbitrary filter strings directly into SQL.

## Sorting
Allowlist sortable fields.

Example:
`?sort=-spend`

## Search
Search endpoints must enforce workspace scope before returning results.
