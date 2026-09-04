import { config } from "dotenv";

// Loads .env from the repo root if present (local dev convenience). No-op in CI, where
// real env vars are injected directly — see docs/implementation/local-development.md.
config();
