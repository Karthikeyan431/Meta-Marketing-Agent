# Change Management
**Document ID:** GOV-005  
**Version:** 1.0  
**Status:** Draft for Approval

## 1. Purpose
Prevent uncontrolled scope and architecture drift during development.

## 2. Change Categories
### Minor
No change to approved architecture, security boundaries, public API contracts, or core requirements.

May be handled within the task.

### Major
Changes requirements, architecture, data model, security model, AI behavior, or public API contracts.

Requires:
- change description
- impact analysis
- affected documents
- updated acceptance criteria
- approval
- ADR when architectural

### Emergency
Production issue requiring immediate mitigation.

Must still be documented retrospectively.

## 3. Change Record
Every major change should record:
- change ID
- reason
- requested change
- impact
- affected requirements
- affected architecture
- security impact
- migration impact
- testing impact
- decision
- approver
- date

## 4. Rule
No implementation should silently change an approved contract. If the implementation reveals a better design, stop, document the proposed change, and obtain approval before proceeding.
