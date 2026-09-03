# ADR-009 — Reliability Objectives
**Status:** Proposed baseline

| Service/Data | RPO | RTO |
|---|---:|---:|
| PostgreSQL application data | ≤15 min | ≤2 hr |
| Audit/action history | ≤15 min | ≤2 hr |
| Reports/object storage | ≤1 hr | ≤4 hr |
| AI transient state | ≤1 hr | ≤4 hr |

Validate these targets with the product owner before production launch.
