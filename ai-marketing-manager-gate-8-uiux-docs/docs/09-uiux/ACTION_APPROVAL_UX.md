# Action and Approval UX
**Document ID:** UI-006 | Version 1.0

## Action Card

```text
┌───────────────────────────────────────────┐
│ Increase Campaign Budget                  │
│                                           │
│ Campaign: SAP — India Leads               │
│ Current: ₹10,000/day                      │
│ Proposed: ₹12,000/day                    │
│ Change: +20%                               │
│                                           │
│ Reason: AI recommendation                 │
│ Policy: Within configured limit            │
│ Approval: Required                         │
│                                           │
│ [Reject]                 [Approve & Run]   │
└───────────────────────────────────────────┘
```

## Required States
- Draft
- Awaiting approval
- Approved
- Executing
- Verified
- Failed
- Verification failed
- Cancelled
- Expired

## Approval Safety
Before approval, show the exact action that will execute. If the action changes after preview, approval must be invalidated and a new preview shown.
