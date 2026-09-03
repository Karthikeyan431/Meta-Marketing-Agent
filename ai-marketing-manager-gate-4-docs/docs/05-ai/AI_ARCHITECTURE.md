# AI Marketing Manager — AI Architecture
**Document ID:** AI-001 | **Version:** 1.0 | **Status:** Draft for Approval

## 1. AI Mission
Convert user marketing intent into reliable answers, structured plans, controlled actions and measurable outcomes.

## 2. AI Is Not the Security Boundary
The model may reason and request tools, but deterministic application services remain authoritative for:
- identity
- authorization
- tenant scope
- policy
- financial limits
- approval
- external execution
- verification

## 3. AI Runtime

```text
User Message
    ↓
Conversation Service
    ↓
Context Builder
    ↓
Intent / Task Router
    ↓
Agent Orchestrator
    ↓
Planner
    ↓
Tool Selection
    ↓
Typed Tool Execution
    ↓
Observation
    ↓
Reasoning / Next Step
    ↓
Final Response
```

For mutations:

```text
Plan
 ↓
Action Compiler
 ↓
Schema Validation
 ↓
Authorization
 ↓
Policy Engine
 ↓
Approval Engine
 ↓
Execution
 ↓
Verification
 ↓
Outcome
```

## 4. Agent Modes
### Answer Mode
Read-only question answering.

### Analysis Mode
Multi-step analysis using trusted data tools.

### Planning Mode
Creates a proposed action plan without execution.

### Action Mode
Executes supported mutations after deterministic controls.

### Optimization Mode
System-triggered bounded optimization.

The mode is application-controlled; the model cannot self-elevate into a more privileged mode.

## 5. AI Tool Principle
Every tool must have:
- explicit name
- typed input schema
- typed output schema
- authorization requirement
- risk classification
- timeout
- retry policy
- audit requirement
- idempotency behavior where applicable

## 6. Tool Categories
### Read
- search_campaigns
- get_campaign
- get_ad_set
- get_ad
- get_insights
- compare_periods
- get_goal_progress
- get_optimization_history

### Analysis
- calculate_metric
- detect_anomalies
- compare_entities
- diagnose_change

### Planning
- build_action_plan
- estimate_impact
- validate_goal

### Mutation
- pause_entity
- resume_entity
- update_budget
- create_supported_campaign_structure
- update_supported_settings

### Governance
- request_approval
- get_policy_result
- get_action_status

The AI should not receive arbitrary SQL, arbitrary HTTP, shell access, credential access or unrestricted code execution.

## 7. Deterministic Action Compiler
AI-generated mutation proposals are converted into canonical commands.

Example:

```json
{
  "action_type": "UPDATE_BUDGET",
  "target": {
    "type": "CAMPAIGN",
    "id": "internal-id"
  },
  "parameters": {
    "budget": 5000,
    "currency": "INR"
  }
}
```

The application validates this independently of the model.

## 8. Response Contract
Responses should clearly distinguish:
- facts
- calculations
- recommendations
- pending actions
- executed actions
- failures
- uncertainty

Never claim execution unless the execution/verification layer confirms it.
