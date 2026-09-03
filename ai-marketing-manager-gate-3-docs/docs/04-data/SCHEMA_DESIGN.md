# Schema Design
**Document ID:** DATA-003 | **Version:** 1.0

## Common Columns
Tenant-owned tables should use:
- id
- workspace_id
- created_at
- updated_at

Where lifecycle applies:
- status
- deleted_at or equivalent only where justified

## users
- id
- identity provider reference
- display name
- email metadata as required
- timestamps

## workspaces
- id
- name
- status
- timezone
- configuration JSON for non-relational settings only

## workspace_memberships
- id
- workspace_id
- user_id
- role
- status
- timestamps

Unique constraint:
`workspace_id + user_id`

## meta_connections
- id
- workspace_id
- provider
- external_business_id
- encrypted credential reference
- token expiry
- status
- last_validated_at

Unique constraint should prevent duplicate active connection identity.

## ad_accounts
- id
- workspace_id
- meta_connection_id
- external_id
- name
- currency
- timezone
- status
- last_synced_at

Unique:
`workspace_id + external_id`

## campaigns
- id
- workspace_id
- ad_account_id
- external_id
- name
- status
- effective_status
- objective
- budget fields where applicable
- start/end metadata
- source_updated_at
- last_synced_at

Unique:
`workspace_id + external_id`

## ad_sets
Same tenant/external identity strategy; references campaign and ad account.

## ads
Same tenant/external identity strategy; references ad set and ad account.

## creatives
Store canonical metadata and external identity; avoid storing unnecessarily large external payloads in transactional rows.

## insights
Use a fact-oriented schema suitable for time-series aggregation.

Suggested dimensions:
- workspace
- ad account
- campaign
- ad set
- ad
- date
- breakdown dimensions

Suggested metrics:
- spend
- impressions
- reach
- clicks
- conversions where available
- leads where available
- revenue/value where available
- derived rates such as CTR/CPC/CPM/CPL when definition is trustworthy

Do not treat derived metrics as source-of-truth when they can be recalculated.

## conversations
- id
- workspace_id
- user_id
- title/status
- timestamps

## messages
- id
- conversation_id
- role
- content/reference
- sequence
- created_at

## ai_runs
- id
- workspace_id
- conversation_id
- model
- prompt/version references
- status
- started_at
- completed_at
- token/cost metadata where available
- trace_id

## ai_tool_calls
- id
- ai_run_id
- tool_name
- validated_arguments
- status
- result metadata
- timestamps

Do not persist secrets in tool arguments/results.

## actions
- id
- workspace_id
- requested_by
- source_ai_run_id nullable
- action_type
- target_type
- target_id
- proposed_parameters
- risk_class
- status
- idempotency_key
- policy_version
- created/executed timestamps

## approvals
- id
- workspace_id
- action_id
- approver
- decision
- decision_reason
- action_version/hash
- timestamps

Approval must bind to the exact action version.

## goals
- id
- workspace_id
- created_by
- name
- objective
- kpi
- target
- current_value
- start_at
- end_at
- budget_limit
- status

## optimization_runs
- id
- workspace_id
- goal_id nullable
- started_at
- completed_at
- status
- summary

## optimization_opportunities
- id
- workspace_id
- optimization_run_id
- target
- signal
- proposed_action
- confidence/quality metadata
- policy_result
- outcome/action reference

## audit_events
- id
- workspace_id
- actor_type
- actor_id nullable
- event_type
- resource_type
- resource_id
- action_id nullable
- metadata
- created_at

Audit records must avoid secrets and excessive sensitive payloads.
