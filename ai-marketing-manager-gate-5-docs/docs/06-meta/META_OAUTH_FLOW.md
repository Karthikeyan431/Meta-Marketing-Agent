# Meta OAuth and Connection Flow
**Document ID:** META-002 | Version 1.0

## Flow

```text
User → Connect Meta
       ↓
Application creates OAuth state
       ↓
Redirect to Meta authorization
       ↓
User authorizes
       ↓
Meta callback
       ↓
Validate state
       ↓
Validate/exchange token
       ↓
Discover authorized assets
       ↓
User selects accounts
       ↓
Store encrypted credential reference
       ↓
Start initial sync
```

## State Protection
OAuth state must be:
- unpredictable
- short-lived
- bound to the initiating user/session
- single-use
- validated on callback

## Token Handling
- Never expose long-lived credentials to frontend code.
- Encrypt sensitive credential material at rest or use a secret manager.
- Store expiry metadata.
- Validate token status.
- Redact tokens from all logs/traces/errors.

Meta provides access-token debugging mechanisms that can expose token-associated metadata such as user and expiry; use supported mechanisms rather than trusting client-provided claims. citeturn1search0

## Disconnect
Disconnect must:
1. disable new external calls
2. revoke/remove stored credential material where applicable
3. preserve required audit/history
4. mark connection disconnected
5. stop scheduled syncs
6. communicate data freshness impact
