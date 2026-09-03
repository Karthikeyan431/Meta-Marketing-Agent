# Data Retention and Lifecycle
**Document ID:** DATA-007 | **Version:** 1.0

## Categories
### Operational Data
Users, workspaces, integrations and current entities follow product/account lifecycle policies.

### Performance Data
Retention should support meaningful reporting and optimization while controlling storage growth.

### Conversations
Retain according to product privacy and workspace policy.

### AI Runs
Retain enough metadata for debugging, evaluation and audit; avoid unnecessary raw sensitive content.

### Audit
Required security and financial-action audit history must follow the product's compliance/retention policy and must not be deleted merely because a Meta connection is disconnected.

### Webhook/Raw Events
Use bounded retention unless required for debugging or compliance.

## Deletion
Deletion workflows must:
- verify authorization
- identify dependent records
- preserve required audit history
- remove/cryptographically destroy secrets as appropriate
- avoid orphaning critical references
- be observable

## Backup
Backups must follow encryption, access-control and retention policies.
