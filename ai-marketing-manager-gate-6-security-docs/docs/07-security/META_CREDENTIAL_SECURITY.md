# Meta Credential Security
**Document ID:** SEC-006 | Version 1.0

## Rules
Meta credentials/tokens:
- are never returned to the browser after connection
- are never placed in AI prompts
- are never stored in conversation messages
- are never written to ordinary logs
- are never exposed through analytics responses

## Storage
Use encrypted secret storage or strong application encryption with managed key protection.

Separate:
- credential ciphertext/reference
- token metadata
- connection status

## Access
Only the Meta integration service should be able to retrieve credential material.

Application services should preferably operate on a credential reference rather than raw credential data.

## Rotation/Reconnection
Support:
- expiry detection
- invalidation detection
- reconnection
- credential replacement
- secure deletion/revocation where applicable

## Incident
If credential leakage is suspected:
1. disable connection
2. prevent new external mutations
3. rotate/revoke credential as appropriate
4. investigate audit logs
5. notify according to incident policy
