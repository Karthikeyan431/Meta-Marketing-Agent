# Context and Memory
**Document ID:** AI-005 | **Version:** 1.0

## Context Layers
### System Context
Immutable application-level instructions and safety rules.

### Workspace Context
Workspace configuration, timezone, currency, goals and policy settings.

### User Context
Authorized user preferences relevant to the task.

### Conversation Context
Recent relevant messages.

### Retrieved Business Context
Fresh data retrieved through authorized tools.

### Execution Context
Current action/approval state.

## Memory Rules
Do not store everything by default.

Persist:
- explicit user preferences when product policy allows
- approved workspace configuration
- goal definitions
- action history required for continuity
- relevant report context

Do not treat model memory as authoritative business state.

Business truth remains in canonical databases and external verified state.
