# Test Data and Environments
**Document ID:** TEST-010 | Version 1.0

## Environments
- local
- development
- staging
- production

## Data Rules
- synthetic data by default
- no copied production secrets
- production data access requires explicit controlled process
- test Meta resources where possible
- deterministic fixtures for automated tests

## Environment Parity
Staging should closely resemble production architecture and configuration without production credentials or spend.
