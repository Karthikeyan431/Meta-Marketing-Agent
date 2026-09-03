# Functional Requirements
**Document ID:** REQ-001 | **Version:** 1.0

## Identity & Workspace
FR-001: The system shall authenticate users.
FR-002: The system shall support workspaces.
FR-003: The system shall associate users with workspaces through memberships.
FR-004: The system shall enforce server-side authorization for workspace resources.
FR-005: The system shall support role-based permissions.

## Meta Integration
FR-010: The system shall support Meta OAuth using the current approved integration flow.
FR-011: The system shall securely store integration credentials/tokens.
FR-012: The system shall discover authorized Meta assets.
FR-013: The system shall allow authorized users to select/manage supported ad accounts.
FR-014: The system shall synchronize supported campaign hierarchy data.
FR-015: The system shall synchronize supported performance/Insights data.
FR-016: The system shall detect authorization/synchronization failures.
FR-017: The system shall support disconnect/revocation workflows.

## Chat
FR-020: The system shall accept natural-language marketing requests.
FR-021: The system shall maintain conversation context within defined boundaries.
FR-022: The system shall resolve references to supported entities.
FR-023: The system shall return read-only analytics results.
FR-024: The system shall produce structured action plans for supported mutations.
FR-025: The system shall validate tool inputs against schemas.

## Execution
FR-030: The system shall authorize each requested mutation.
FR-031: The system shall evaluate mutations against policy.
FR-032: The system shall require approval when configured.
FR-033: The system shall execute supported Meta operations through an integration adapter.
FR-034: The system shall verify important mutation outcomes.
FR-035: The system shall record required audit information.

## Goals & Optimization
FR-040: The system shall allow authorized users to define goals.
FR-041: The system shall track goal progress.
FR-042: The system shall evaluate optimization opportunities.
FR-043: The system shall prevent optimization actions outside configured limits.
FR-044: The system shall maintain optimization history.

## Reporting
FR-050: The system shall generate performance reports.
FR-051: The system shall support period comparisons.
FR-052: The system shall indicate data freshness where relevant.

## Governance
FR-060: The system shall support configurable approval thresholds.
FR-061: The system shall support configurable financial limits.
FR-062: The system shall provide audit-log access to authorized users.
FR-063: The system shall support an emergency stop for eligible autonomous operations.
