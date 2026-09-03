# Global Search and Navigation UX
**Document ID:** UI-003 | Version 1.0

## Goal
Users can quickly find accounts, campaigns, ad sets, ads, reports and actions from anywhere.

## Interaction
Keyboard shortcut: `Ctrl/Cmd + K`

Search should:
- recognize natural language
- identify entities
- categorize results
- show relevant recommendations
- navigate to the correct resource

Example:
`SAP`

```text
Search
├── Accounts
│   └── SAP
├── Campaigns
│   ├── SAP — India Leads
│   └── SAP — Retargeting
├── Ad Sets
└── Reports
```

## Search Rules
- enforce workspace scope
- rank exact entity matches highly
- distinguish account/campaign/ad set/ad/report
- never navigate based only on an ambiguous name
- show breadcrumbs/context for ambiguous results
