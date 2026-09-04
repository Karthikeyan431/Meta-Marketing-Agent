# services/ai

Intentionally empty in Phase 1 (Foundation).

Per the Phase 1 task's explicit Hard Restrictions: no AI chat, no AI tool execution in
this phase. The `AIProvider` abstraction and OpenAI adapter described in
ADR-004-AI-ARCHITECTURE.md
(`docs/ai-marketing-manager-phase-1a-architecture-finalization/docs/13-architecture-finalization/`)
are Phase 8 (AI Read-Only) scope, built on top of the deterministic authorization/policy/
audit foundation established in Phases 1, 2, 5 and 9 — per the architecture's core rule
that AI is never the security boundary.
