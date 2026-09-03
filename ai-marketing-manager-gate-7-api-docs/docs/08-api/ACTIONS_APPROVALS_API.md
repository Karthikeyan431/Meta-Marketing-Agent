# Actions and Approvals API
**Document ID:** API-008 | Version 1.0

## Action States
`PROPOSED → VALIDATED → POLICY_EVALUATED → PENDING_APPROVAL → APPROVED → EXECUTING → VERIFIED`

Terminal alternatives:
`REJECTED`, `FAILED`, `VERIFICATION_FAILED`, `CANCELLED`, `EXPIRED`.

## Approval
`POST /api/v1/approvals/{approvalId}/approve`

Server verifies:
- approver identity
- workspace membership
- permission
- approval expiry
- action fingerprint
- current policy
- action not already executed
- no emergency stop

## Execution
Clients do not directly execute Meta operations. They request or approve application actions.
