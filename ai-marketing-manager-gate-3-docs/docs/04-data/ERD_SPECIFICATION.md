# ERD Specification
**Document ID:** DATA-002 | **Version:** 1.0

## Core Relationships

```text
User
  |
  +--< WorkspaceMembership >-- Workspace
                                |
                                +--< MetaConnection
                                |
                                +--< AdAccount
                                      |
                                      +--< Campaign
                                            |
                                            +--< AdSet
                                                  |
                                                  +--< Ad
                                                        |
                                                        +-- Creative

Workspace
  +--< Conversation
  |      +--< Message
  |      +--< AIRun
  |
  +--< Goal
  +--< OptimizationRun
  +--< Action
  |      +--< Approval
  |
  +--< AuditEvent
  +--< Report
  +--< SyncRun
```

## Identity Tables
- users
- sessions/auth-provider identities as applicable
- workspaces
- workspace_memberships
- roles/permissions if implemented dynamically

## Integration Tables
- meta_connections
- meta_assets/accounts
- sync_runs
- webhook_events

## Advertising Tables
- ad_accounts
- campaigns
- ad_sets
- ads
- creatives
- external_entity_mappings where needed

## Analytics Tables
- insight_daily or equivalent fact table
- metric definitions
- sync coverage

## AI Tables
- conversations
- messages
- ai_runs
- ai_tool_calls
- model/prompt version references

## Governance Tables
- actions
- action_attempts
- approvals
- policy_evaluations
- audit_events
- emergency_stop states

## Goal Tables
- goals
- goal_metrics / snapshots
- optimization_runs
- optimization_opportunities

## Reporting
- reports
- report_runs
- report_artifacts if needed
