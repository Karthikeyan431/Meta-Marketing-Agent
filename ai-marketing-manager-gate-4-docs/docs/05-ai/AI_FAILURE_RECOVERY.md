# AI Failure and Recovery
**Document ID:** AI-013 | **Version:** 1.0

## Failure Classes
- model timeout
- provider unavailable
- invalid structured output
- tool failure
- authorization failure
- policy rejection
- external API failure
- verification failure
- context retrieval failure

## Behavior
### Invalid Model Output
Retry with bounded attempts or fail safely.

### Tool Failure
Classify and retry only when safe.

### Policy Failure
Do not retry by changing parameters unless a legitimate user correction occurs.

### Verification Failure
Do not claim success.

### Model Unavailable
Fall back only to an approved model path; otherwise return a clear service limitation.

## Partial Execution
If a multi-action plan partially executes, the system must report exactly which actions succeeded, failed or remain pending.
