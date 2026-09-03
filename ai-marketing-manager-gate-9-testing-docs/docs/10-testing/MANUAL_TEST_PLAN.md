# Manual Test Plan
**Document ID:** TEST-014 | Version 1.0

## Tester Sequence
### A. Account
- sign in/out
- inspect workspace
- connect/disconnect Meta

### B. Data
- verify account list
- verify campaign data
- compare selected metrics with source

### C. AI
- ask read-only questions
- test ambiguous entities
- test incorrect assumptions
- inject instructions into campaign names and descriptions

### D. Mutations
- request safe change
- inspect preview
- reject
- approve
- verify result
- test duplicate request

### E. Failure
- simulate Meta failure
- confirm truthful UI
- retry safely

### F. Security
- attempt cross-workspace access
- attempt unauthorized approval
- attempt policy bypass

Record expected vs actual behavior and attach evidence for release sign-off.
