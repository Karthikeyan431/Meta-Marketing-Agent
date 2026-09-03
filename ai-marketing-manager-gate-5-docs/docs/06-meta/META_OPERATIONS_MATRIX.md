# Meta Supported Operations Matrix
**Document ID:** META-004 | Version 1.0

This is the product control matrix. Exact Meta endpoint/permission mapping must be verified during implementation against current Meta documentation and app review requirements.

| Operation | Read | Recommend | Execute MVP | Approval |
|---|---:|---:|---:|---:|
| Account performance | Yes | Yes | No | — |
| Campaign performance | Yes | Yes | No | — |
| Ad set performance | Yes | Yes | No | — |
| Ad performance | Yes | Yes | No | — |
| Campaign status change | Yes | Yes | Yes | Configurable |
| Ad set status change | Yes | Yes | Yes | Configurable |
| Ad status change | Yes | Yes | Yes | Configurable |
| Budget update | Yes | Yes | Yes | Required initially |
| Create campaign | Yes | Yes | Yes | Required |
| Create ad set | Yes | Yes | Yes | Required |
| Create ad | Yes | Yes | Yes | Required |
| Creative changes | Yes | Yes | Limited | Required |
| Delete destructive resources | Yes | Yes | No initially | — |
| Bulk changes | Yes | Yes | Limited | Required |
| Scheduled optimization | Yes | Yes | Bounded | Required initially |

## Product Rule
Unsupported operations must return a clear limitation rather than attempting arbitrary Meta API calls.
