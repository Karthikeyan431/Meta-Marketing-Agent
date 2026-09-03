# Entity Resolution
**Document ID:** AI-004 | **Version:** 1.0

## Purpose
Map natural-language references to canonical internal entities.

## Resolution Strategy
1. Search only authorized workspace scope.
2. Normalize query.
3. Search exact name/external identifier.
4. Search aliases/known references.
5. Rank candidates.
6. Require confidence threshold.
7. If multiple materially plausible candidates remain, ask clarification.

## Examples
“SAP opportunity” must never be silently mapped to a campaign if the user context is about advertising campaigns.

“the India campaign” may resolve only when one candidate is sufficiently unambiguous.

## Safety
External IDs supplied by users are lookup inputs, not authorization credentials.
