# Acceptance Criteria
**Document ID:** REQ-004 | **Version:** 1.0

## AC-001 — Meta Connection
Given an authorized user, when they connect Meta successfully, then the platform records the connection securely, discovers available authorized assets, and presents selectable assets.

## AC-002 — Tenant Isolation
Given two workspaces, a user in Workspace A must never retrieve or mutate Workspace B data, even when manipulating request parameters directly.

## AC-003 — Campaign Query
Given synchronized campaign data, when an authorized user asks for campaign performance, the answer must use the correct workspace/ad-account scope and identify data freshness where relevant.

## AC-004 — Entity Resolution
When a user refers to a campaign by name, the system must resolve it to the correct entity or ask for clarification if ambiguous.

## AC-005 — Mutation Authorization
A mutation requested by a user without permission must be rejected before external execution.

## AC-006 — Policy Limit
A mutation exceeding configured limits must not reach Meta execution.

## AC-007 — Approval
When policy requires approval, the action must remain pending until an authorized approver explicitly approves the exact action.

## AC-008 — Execution Verification
After a successful mutation, the system must verify the resulting state where technically possible and report the actual outcome.

## AC-009 — Audit
Required AI mutations must create an audit record containing actor, workspace, action, target, relevant parameters, policy decision, approval decision when applicable, execution result, and timestamps.

## AC-010 — Prompt Injection
Malicious instructions embedded in campaign/ad data must not cause unauthorized tool calls or policy changes.

## AC-011 — Autonomous Optimization
Autonomous optimization must execute only when the workspace has explicitly enabled it and all configured limits and policies pass.

## AC-012 — Emergency Stop
After an authorized emergency stop, eligible new autonomous actions must not execute until autonomous operation is re-enabled according to policy.

## AC-013 — Failure Honesty
If Meta returns an error or execution cannot be verified, the assistant must not claim success.

## AC-014 — Reporting Accuracy
Reports must be generated from trusted synchronized data and must not invent missing metrics.

## AC-015 — Unsupported Capability
If a requested Meta operation is not supported by the current integration, the system must state that it is unsupported rather than pretending to perform it.
