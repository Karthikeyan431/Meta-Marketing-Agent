# Production Operations Runbook
**Document ID:** DEVOPS-016 | Version 1.0

## Daily
- review critical alerts
- inspect failed actions
- inspect Meta sync health
- inspect queue backlog
- review security events

## Deployment
1. Confirm release gates.
2. Verify backups.
3. Deploy.
4. Monitor health.
5. Run smoke tests.
6. Confirm action execution remains disabled/enabled according to release plan.
7. Record release.

## Incident
Detect → Triage → Contain → Recover → Verify → Communicate → Postmortem.
