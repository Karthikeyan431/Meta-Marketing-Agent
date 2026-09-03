# Recommended Repository Structure
**Document ID:** DEVREADY-005 | Version 1.0

Adapt names to the existing repository after Phase 0 assessment.

```text
/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   ├── ui/
│   ├── domain/
│   └── config/
├── services/
│   ├── ai/
│   └── meta/
├── workers/
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── e2e/
│   ├── security/
│   └── ai-evals/
├── docs/
├── infrastructure/
└── scripts/
```

Do not force this structure if the inspected repository already has a sound architecture.
