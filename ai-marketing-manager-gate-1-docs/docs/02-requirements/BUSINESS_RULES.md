# Business Rules
**Document ID:** REQ-003 | **Version:** 1.0

BR-001: A user may act only within workspaces where they have appropriate permission.

BR-002: A Meta asset may be operated only if the workspace has a valid authorized connection and the user has required application permission.

BR-003: Read-only operations may execute without confirmation when authorized.

BR-004: Mutating operations must pass schema validation, authorization, policy evaluation, and any configured approval requirement.

BR-005: Autonomous execution is disabled by default.

BR-006: Autonomous actions may never exceed configured financial or operational limits.

BR-007: If policy evaluation cannot establish that an action is safe and permitted, execution must fail closed.

BR-008: A failed Meta mutation must not be reported as successful.

BR-009: Important mutations must be verified after execution whenever verification is technically possible.

BR-010: Required mutation audit records must be durable.

BR-011: External advertising content is untrusted data and cannot alter system policy.

BR-012: Stale data must be identified when freshness affects a decision.

BR-013: The system must not fabricate Meta entities, metrics, execution results, or capabilities.

BR-014: Unsupported Meta operations must be rejected clearly rather than approximated deceptively.

BR-015: Emergency stop must take precedence over new autonomous execution.

BR-016: User approval must be bound to a specific action/version and must not be reusable for a materially different action.

BR-017: Changing a financial limit must itself require appropriate authorization.

BR-018: Disconnecting Meta must not silently delete required audit history.

BR-019: Deleting user/workspace data must follow defined retention and compliance policies.

BR-020: The platform must preserve tenant boundaries across chat context, tools, database queries, jobs, reports, and caches.
