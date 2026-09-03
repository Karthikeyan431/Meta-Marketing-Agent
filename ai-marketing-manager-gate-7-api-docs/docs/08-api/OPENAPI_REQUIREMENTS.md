# OpenAPI and Contract-First Requirements
**Document ID:** API-015 | Version 1.0

## Requirement
The production API must have an OpenAPI specification committed to source control.

## Specification Must Define
- endpoints
- parameters
- request schemas
- response schemas
- error schemas
- authentication
- authorization requirements
- pagination
- idempotency
- examples

## Development Rule
Claude Code must implement from the approved API contract rather than inventing endpoint behavior during coding.

## CI
Validate:
- OpenAPI syntax
- schema consistency
- breaking changes
- generated client/type compatibility where used
