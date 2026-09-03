# Agent Workflow
**Document ID:** AI-002 | **Version:** 1.0

## Standard Loop
1. Receive user request.
2. Load authorized conversation context.
3. Determine task class.
4. Resolve entities.
5. Select appropriate tools.
6. Execute read tools as required.
7. Evaluate results.
8. Decide whether additional information is needed.
9. For mutations, create structured action proposal.
10. Pass proposal to deterministic validation.
11. Obtain approval if required.
12. Execute.
13. Verify.
14. Record audit.
15. Respond.

## Stop Conditions
The agent must stop and ask the user when:
- required entity is ambiguous
- required parameter is missing
- user intent is materially ambiguous
- authorization is insufficient
- policy denies action
- external state cannot be safely verified
- requested capability is unsupported
- data freshness is inadequate for the requested decision

## Tool Loop Limit
The application must impose bounded tool-call/step limits to prevent runaway agent loops.

## Context Budget
The system should retrieve only context relevant to the current task instead of replaying unbounded conversation history.
