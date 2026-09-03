# AI Tool Contract
**Document ID:** DEVREADY-009 | Version 1.0

Every AI tool must define:
- tool name
- purpose
- input schema
- output schema
- authorization requirement
- allowed workspace scope
- read/write classification
- policy requirement
- idempotency requirement
- verification requirement
- audit requirement
- failure behavior

Example conceptual tool:

```text
get_campaign_insights
read-only
input: ad_account_id, campaign_id?, date_range, metrics
authorization: insights:read
workspace-scoped: yes
```

Mutation tools require stricter controls and must create an application action rather than letting the model directly call a privileged provider API.
