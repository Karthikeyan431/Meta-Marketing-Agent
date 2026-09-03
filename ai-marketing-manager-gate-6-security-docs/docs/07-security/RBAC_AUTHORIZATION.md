# RBAC and Authorization
**Document ID:** SEC-004 | Version 1.0

## Authorization Model

```text
User
 ↓
Workspace Membership
 ↓
Role / Permissions
 ↓
Resource Scope
 ↓
Operation
 ↓
Policy
```

Authorization must be evaluated at a trusted service layer, not in frontend code.

## Example Roles
- OWNER
- ADMIN
- MARKETER
- ANALYST
- APPROVER
- VIEWER

Role names are product concepts; exact permissions must be explicitly defined.

## Permission Dimensions
- workspace
- resource
- operation
- sensitivity
- financial impact

## Object-Level Authorization
Every request must verify:
1. authenticated user
2. workspace membership
3. permission
4. resource belongs to workspace
5. operation is allowed

## AI
AI acts on behalf of a user but does not inherit unlimited privileges. Each tool invocation is authorized using the initiating user's current permissions.

## Background Jobs
Workers must carry a signed/validated execution context or trusted internal job identity plus explicit workspace and action scope.
