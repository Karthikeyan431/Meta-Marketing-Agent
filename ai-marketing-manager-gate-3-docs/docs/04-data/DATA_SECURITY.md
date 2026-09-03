# Data Security
**Document ID:** DATA-009 | **Version:** 1.0

## Secrets
Meta access credentials/tokens must be encrypted or stored through a dedicated secret-management mechanism.

Never store:
- raw access tokens in logs
- tokens in chat messages
- tokens in AI prompts
- tokens in audit metadata
- tokens in client-side state

## Sensitive Data
Minimize storage of:
- unnecessary Meta payloads
- unnecessary personal data
- raw model prompts/responses containing sensitive information

## Encryption
Use TLS for transport and appropriate encryption at rest.

## Access
Production database access must be restricted and auditable.

## Logging
Logs should contain identifiers and trace information necessary for debugging without secret values.
