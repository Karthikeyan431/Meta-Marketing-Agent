# Meta Connection Setup UX
**Document ID:** UI-008 | Version 1.0

## Flow

```text
Connections
   ↓
Connect Meta
   ↓
Meta authorization
   ↓
Return to platform
   ↓
Discover businesses/ad accounts
   ↓
Select account(s)
   ↓
Initial synchronization
   ↓
Connected
```

## States
- Not connected
- Connecting
- Authorization required
- Syncing
- Connected
- Degraded
- Reconnect required
- Disconnected

## UX Requirements
Never display the Meta access token.
Explain what account access the connection provides.
Show selected account scope and connection health.
