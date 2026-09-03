# AI Marketing Manager

A production-grade AI platform for managing Meta advertising campaigns through a chat-first interface.

## Repository status

This repository is currently **documentation-only**. No application code has been written yet. It holds the approved (pending final sign-off — see below) SDLC architecture for the project, organized as a sequence of gates, plus the Phase 0/1A implementation-planning artifacts produced from them.

```text
docs/
├── implementation/                                  Phase 0 outputs: repository assessment, implementation plan
├── ai-marketing-manager-gate-0-docs/                 Gate 0  — Governance
├── ai-marketing-manager-gate-1-docs/                 Gate 1  — Product & Requirements
├── ai-marketing-manager-gate-2-docs/                 Gate 2  — System Architecture
├── ai-marketing-manager-gate-3-docs/                 Gate 3  — Data Architecture
├── ai-marketing-manager-gate-4-docs/                 Gate 4  — AI Architecture
├── ai-marketing-manager-gate-5-docs/                 Gate 5  — Meta Integration
├── ai-marketing-manager-gate-6-security-docs/        Gate 6  — Security
├── ai-marketing-manager-gate-7-api-docs/             Gate 7  — API
├── ai-marketing-manager-gate-8-uiux-docs/            Gate 8  — UI/UX
├── ai-marketing-manager-gate-9-testing-docs/         Gate 9  — Testing & Quality
├── ai-marketing-manager-gate-10-devops-docs/         Gate 10 — DevOps & Infrastructure
├── ai-marketing-manager-gate-11-development-readiness/ Gate 11 — Development Readiness
└── ai-marketing-manager-phase-1a-architecture-finalization/ Phase 1A — Architecture Finalization (ADRs, tech stack baseline)
```

**Governance note:** as of the Phase 0 assessment, every gate document self-reports `Status: Draft for Approval` with unchecked approval checklists. Do not treat any architectural decision here as final until its owning gate is explicitly approved. See `docs/implementation/repository-assessment.md` §9 and `docs/ai-marketing-manager-phase-1a-architecture-finalization/docs/13-architecture-finalization/` for the current decision status.

## Before writing code

Read, in order:
1. `docs/ai-marketing-manager-gate-0-docs/CLAUDE.md` — development constitution
2. `docs/implementation/repository-assessment.md` and `implementation-plan.md`
3. `docs/ai-marketing-manager-phase-1a-architecture-finalization/docs/13-architecture-finalization/` — accepted technology baseline and open decisions
4. The relevant gate's documents for the area you are working in

Do not scaffold, install dependencies, or implement anything until the blockers recorded in the Phase 0/1A reports are explicitly resolved by the project owner.
