# AI Evaluation Strategy
**Document ID:** TEST-004 | Version 1.0

## Evaluation Categories
1. Intent classification
2. Entity resolution
3. Tool selection
4. Argument generation
5. Policy awareness
6. Approval behavior
7. Data-grounded reasoning
8. Report quality
9. Truthfulness
10. Prompt-injection resistance

## Golden Dataset
Create versioned test cases containing:
- user request
- expected intent
- expected entity
- allowed tool
- expected arguments
- expected policy result
- expected action state
- expected response characteristics

## Safety Rule
A model response claiming an action succeeded is a failure if the system's execution/verification record says otherwise.

## Regression
Every model/prompt/tool change must run the AI regression suite before release.
