# Resilience and Failure Testing
**Document ID:** TEST-009 | Version 1.0

## Failures
- database unavailable
- queue unavailable
- AI provider timeout
- Meta timeout
- Meta rate limit
- webhook duplication
- worker crash
- network interruption
- stale connection
- partial batch failure

## Required Behavior
- fail closed for privileged actions
- avoid duplicate external mutations
- preserve action state
- retry only safe/idempotent operations
- expose truthful status
- provide recovery path

## Disaster Recovery
Test backup restore and critical-service recovery before production sign-off.
