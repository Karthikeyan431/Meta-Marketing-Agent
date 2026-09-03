# Autonomous Optimization Architecture
**Document ID:** AI-008 | **Version:** 1.0

## Principle
Autonomy is a bounded operating mode, not unrestricted agent freedom.

## Required Inputs
- active goal
- eligible entities
- current metrics
- comparison period
- freshness
- configured limits
- policy version
- optimization strategy

## Pipeline
```text
Scheduler
 ↓
Freshness Gate
 ↓
Goal Evaluation
 ↓
Opportunity Detection
 ↓
Candidate Generation
 ↓
Impact/Risk Evaluation
 ↓
Policy Gate
 ↓
Approval / Auto-Approval
 ↓
Execute
 ↓
Verify
 ↓
Measure Outcome
```

## Required Guardrails
- max budget increase/decrease
- max daily spend impact
- allowed action types
- allowed entity scope
- minimum data volume
- cooldown period
- maximum action frequency
- emergency stop

## No Self-Modification
The optimizer cannot modify its own permissions, financial limits, policies or approval requirements.
