# Frontend Architecture
**Document ID:** ARCH-004 | **Version:** 1.0

## Primary Experience
Chat is the primary command interface, while structured UI provides visibility, configuration and approvals.

## Main Areas
1. Home/Overview
2. Chat
3. Campaigns
4. Analytics
5. Goals
6. Optimization
7. Approvals
8. Reports
9. Integrations
10. Settings
11. Audit

## Chat UX Requirements
- Show whether response is based on current/synchronized data.
- Show action previews before approval.
- Distinguish recommendation, planned action, pending approval, executing and completed states.
- Show failures clearly.
- Never display raw credentials.
- Allow users to inspect affected entities and action parameters.

## State
Server state is canonical. Client state must never be trusted for authorization.

## Accessibility
Target WCAG-aligned keyboard navigation, semantic structure, readable contrast and clear action states.
