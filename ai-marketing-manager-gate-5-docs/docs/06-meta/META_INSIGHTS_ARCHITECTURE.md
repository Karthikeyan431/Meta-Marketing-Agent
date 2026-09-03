# Meta Insights and Reporting Architecture
**Document ID:** META-005 | Version 1.0

## Data Flow

```text
Meta Insights
 ↓
Insights Worker
 ↓
Normalize dimensions/metrics
 ↓
Validate
 ↓
Upsert fact records
 ↓
Analytics layer
 ↓
Chat / Reports / Optimization
```

## Metric Rules
- Preserve source metric meaning.
- Store source date/granularity.
- Track attribution/breakdown context where relevant.
- Calculate derived metrics consistently.
- Do not compare incompatible attribution windows or breakdowns without explicit handling.

## Freshness
Every analytics response should be able to expose:
- last synchronized time
- requested reporting range
- source coverage
- stale/unavailable status

## Reporting
Reports must be generated from canonical/validated analytics data, not from unverified model-generated numbers.
