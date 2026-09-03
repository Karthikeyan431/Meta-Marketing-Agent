# Intent and Task Model
**Document ID:** AI-003 | **Version:** 1.0

## Intent Classes
- QUERY
- ANALYZE
- COMPARE
- EXPLAIN
- PLAN
- MUTATE
- CREATE
- OPTIMIZE
- REPORT
- CONFIGURE
- APPROVE
- STOP_AUTONOMATION
- UNSUPPORTED
- CLARIFICATION_REQUIRED

## Intent Extraction
For each request derive, where available:
- objective
- entity type
- entity reference
- action
- parameters
- timeframe
- KPI
- constraints
- desired output

## Example
“Pause SAP India campaign if CPL is above ₹800.”

Structured interpretation:
- trigger condition: CPL > 800 INR
- target: SAP India campaign
- action: pause
- scope: campaign
- condition evaluation required
- mutation: yes
- policy evaluation: required

The model's interpretation is not execution authority.
