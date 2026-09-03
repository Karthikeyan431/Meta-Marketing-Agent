# Event Architecture
**Document ID:** ARCH-006 | **Version:** 1.0

## Event Categories
- workspace.created
- meta.connection.created
- meta.connection.invalid
- meta.sync.started
- meta.sync.completed
- meta.sync.failed
- campaign.updated
- insights.synced
- ai.run.started
- ai.run.completed
- action.requested
- action.approved
- action.rejected
- action.executed
- action.failed
- action.verified
- goal.created
- goal.progressed
- optimization.detected
- optimization.executed
- emergency_stop.enabled

## Event Rules
- Events are internal integration contracts.
- Events must include workspace scope.
- Events must have unique IDs.
- Consumers must tolerate duplicate delivery.
- Sensitive credentials must never be included in event payloads.
