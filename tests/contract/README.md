# tests/contract

Empty in Phase 1. Contract tests validate the OpenAPI specification against real
responses (`API_TEST_STRATEGY.md`) — there is no OpenAPI spec yet, since the `/api/v1`
contract surface is Phase 5 (API) scope. `Zod` schemas exist today only for the two
foundation endpoints (`/health`, `/ready`), which are intentionally outside the
versioned public contract.
