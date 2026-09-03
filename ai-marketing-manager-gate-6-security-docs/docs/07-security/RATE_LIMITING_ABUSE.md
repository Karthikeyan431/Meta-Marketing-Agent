# Rate Limiting and Abuse Prevention
**Document ID:** SEC-013 | Version 1.0

## Layers
1. Edge/IP
2. User
3. Workspace
4. API route
5. AI request
6. Tool invocation
7. Mutation
8. Meta account

## Protect Against
- credential stuffing
- chat flooding
- AI token abuse
- tool-loop abuse
- bulk campaign mutation
- provider API exhaustion
- denial of wallet

## Adaptive Controls
Increase restrictions on suspicious behavior.

High-risk mutation limits should be stricter than read-only analytics limits.
