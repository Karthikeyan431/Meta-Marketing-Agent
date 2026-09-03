# UI States and Error Handling
**Document ID:** UI-012 | Version 1.0

Every major screen must define:
- loading
- skeleton
- empty
- populated
- partial data
- stale data
- permission denied
- connection degraded
- API failure
- retrying
- offline/connection interruption where relevant

## Error UX
Errors should say:
1. what happened
2. whether anything changed
3. what the user can do next

Never show “success” when external verification failed.
