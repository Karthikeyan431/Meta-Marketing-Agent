# AI Marketing Manager — UI/UX Architecture
**Document ID:** UI-001 | Version 1.0 | Status: Draft for Approval

## Product UX Goal
Create a chat-first advertising operating system where users can ask, analyze, plan, execute, approve and monitor Meta advertising work without losing visibility or control.

## UX Principles
1. Chat is the primary command surface.
2. Visual interfaces remain the source of operational context.
3. AI explains before high-impact execution.
4. Users always know what the AI is doing.
5. Every action has visible status.
6. Errors are actionable and truthful.
7. No destructive or financial action is hidden behind natural language.
8. Keyboard-first workflows should be supported.
9. Accessibility is a release requirement.

## Primary Information Architecture

```text
App
├── Home / AI Command Center
├── Accounts
│   └── Ad Account
│       ├── Overview
│       ├── Campaigns
│       ├── Ad Sets
│       ├── Ads
│       └── Insights
├── Campaigns
├── Reports
├── Actions
│   ├── Pending
│   ├── Running
│   └── History
├── Connections
├── Settings
│   ├── Workspace
│   ├── Team / Roles
│   ├── AI Controls
│   ├── Spend Policies
│   └── Security
└── Help
```

## Responsive Strategy
Desktop is the primary power-user experience. Tablet and mobile must support monitoring, chat, approvals and urgent actions without requiring desktop-only controls.
