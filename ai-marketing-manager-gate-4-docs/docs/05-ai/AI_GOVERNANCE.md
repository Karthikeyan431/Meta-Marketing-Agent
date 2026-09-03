# AI Governance
**Document ID:** AI-014 | **Version:** 1.0

## Required Controls
- prompt versioning
- model version tracking
- tool contract versioning
- evaluation before release
- auditability of high-risk actions
- human approval where configured
- documented AI limitations

## Change Management
AI changes include:
- model changes
- prompt changes
- tool changes
- retrieval changes
- policy changes
- agent workflow changes

All material changes require regression evaluation.

## Production Rule
No AI behavior should be promoted to production solely because it “looks good” in manual testing. Relevant automated evaluation and critical-path manual UAT are required.
