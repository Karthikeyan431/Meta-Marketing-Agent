# Security Boundary

```text
Browser
  ↓
Application API
  ↓
Authentication
  ↓
Workspace/RBAC
  ↓
Resource authorization
  ↓
Action policy
  ↓
Approval
  ↓
Application executor  (Deterministic Action Compiler — AI proposals are never executed directly)
  ↓
Meta adapter
  ↓
Meta
  ↓
Verification  (read-after-write; VERIFIED / VERIFICATION_FAILED — never report success unverified)
  ↓
Audit  (append-only; records actor, workspace, action, policy/approval decision, outcome)
  ↓
Response to user
```

The AI model sits inside the application orchestration layer. It cannot bypass authorization, policy, approval, verification or audit.

Secrets stay server-side. External provider state is untrusted input.

## Phase 1A validation note

This chain was checked against the equivalent boundary definitions in the SDLC corpus (Gate 2 `SYSTEM_ARCHITECTURE.md` §3 four trust boundaries and ADR-002; Gate 6 `SECURITY_ARCHITECTURE.md` ten core principles; Gate 7 `AUTHORIZATION_MODEL.md`) and found **consistent — no conflict**. The Verification and Audit steps were added to the diagram in this pass; the original draft named them only in prose ("cannot bypass ... verification or audit") without showing them as terminal chain steps, which understated the corpus's explicit rule that a response must never claim success without both.
