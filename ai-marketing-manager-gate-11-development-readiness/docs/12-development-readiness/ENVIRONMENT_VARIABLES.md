# Environment Configuration Contract
**Document ID:** DEVREADY-006 | Version 1.0

Names are examples and must be adapted to the selected stack.

## Application
- `APP_ENV`
- `APP_URL`
- `API_URL`
- `LOG_LEVEL`

## Database
- `DATABASE_URL`

## Session/Auth
- session/signing configuration
- OAuth configuration

## Meta
- Meta application ID
- Meta application secret
- webhook configuration
- provider API version

## AI
- provider/model configuration
- AI credentials
- usage limits

## Storage/Queue
- object storage configuration
- queue/cache configuration

## Rules
Secrets are injected by environment/secret manager.
Never commit `.env` files containing real credentials.
Validate required variables during application startup.
