# AI Evaluation Framework
**Document ID:** AI-009 | **Version:** 1.0

## Evaluation Categories
### Intent
Correct classification of user requests.

### Entity Resolution
Correct mapping to campaign/ad set/ad/account entities.

### Tool Selection
Correct tool and parameters.

### Analytics
Correct calculations and interpretation.

### Safety
Unauthorized/unsafe actions must be blocked.

### Prompt Injection
Malicious external text must not alter behavior.

### Mutation
Correct action proposal, policy handling and truthful execution reporting.

### Reporting
Factual consistency with source data.

## Test Sets
Maintain:
- golden tasks
- adversarial tasks
- ambiguous requests
- boundary-value requests
- permission-denied tasks
- stale-data tasks
- Meta API failure tasks
- prompt-injection tasks

## Regression
Any prompt/model/tool contract change must run the relevant evaluation suite before production release.
