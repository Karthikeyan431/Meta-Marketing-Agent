# Architecture Workflows
**Document ID:** ARCH-008 | **Version:** 1.0

## A. User Read Request
```text
User
 ↓
Chat UI
 ↓
API
 ↓
Authentication
 ↓
Workspace Authorization
 ↓
AI Orchestrator
 ↓
Typed Read Tool
 ↓
Analytics/Meta Data
 ↓
Response
```

## B. User Mutation
```text
User
 ↓
AI Intent
 ↓
Entity Resolution
 ↓
Action Plan
 ↓
Authorization
 ↓
Policy Engine
 ↓
Approval?
 ├─ Yes → Pending Approval → Approve → Execute
 └─ No  → Execute
                ↓
           Meta Adapter
                ↓
             Verify
                ↓
              Audit
                ↓
             Response
```

## C. Autonomous Optimization
```text
Scheduler
 ↓
Goal/Optimization Worker
 ↓
Freshness Check
 ↓
Opportunity Detection
 ↓
Candidate Action
 ↓
Policy
 ↓
Approval/Auto-Approval
 ↓
Execution
 ↓
Verification
 ↓
Outcome Measurement
 ↓
Audit
```

## D. Emergency Stop
```text
Admin
 ↓
Emergency Stop
 ↓
Persist disabled state
 ↓
Block new autonomous actions
 ↓
Cancel eligible queued actions
 ↓
Audit
 ↓
Notify
```
