# Chat Command Center
**Document ID:** UI-002 | Version 1.0

## Layout

```text
┌───────────────────────────────────────────────────────────┐
│ Workspace | Account | Search | Notifications | Profile   │
├──────────────┬────────────────────────────────────────────┤
│ Navigation   │ AI Command Center                          │
│              │                                            │
│ Home         │ Conversation                               │
│ Accounts     │ User: Increase budget for SAP campaign... │
│ Campaigns    │                                            │
│ Reports      │ AI: I found 2 matching campaigns.         │
│ Actions      │ [Review proposed changes]                 │
│ Connections  │                                            │
│ Settings     │ ───────────────────────────────────────── │
│              │ Ask anything...                    [Send]  │
└──────────────┴────────────────────────────────────────────┘
```

## Chat Capabilities
Examples:
- “Show campaigns spending over ₹10,000 this week.”
- “Why did CPL increase yesterday?”
- “Pause the underperforming campaign.”
- “Create a lead campaign for the new product.”
- “Prepare a weekly report.”

## AI Response Structure
Prefer:
1. direct answer
2. supporting evidence
3. proposed action if applicable
4. action controls
5. relevant navigation

## Action Preview
For mutations show:
- target
- current value
- proposed value
- reason
- expected impact
- policy status
- approval requirement
- execution status
