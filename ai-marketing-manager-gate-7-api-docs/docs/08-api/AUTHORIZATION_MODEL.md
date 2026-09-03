# API Authorization Model
**Document ID:** API-006 | Version 1.0

Every protected endpoint evaluates:

```text
Authenticated?
   ↓
Workspace member?
   ↓
Permission?
   ↓
Resource belongs to workspace?
   ↓
Operation allowed?
   ↓
Policy required?
```

## Important
A URL such as `/campaigns/{id}` never implies authorization.

The server must resolve the resource and verify workspace ownership/membership.

## AI Endpoints
AI requests inherit the initiating user's authorized workspace context. The client cannot expand that context by modifying request fields.
