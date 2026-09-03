# API Endpoint Catalog
**Document ID:** API-002 | Version 1.0

## Authentication / Session
- `GET /api/v1/me`
- `POST /api/v1/auth/logout`

## Workspaces
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/{workspaceId}`
- `PATCH /api/v1/workspaces/{workspaceId}`

## Meta Connections
- `POST /api/v1/workspaces/{workspaceId}/meta/connect`
- `GET /api/v1/workspaces/{workspaceId}/meta/connections`
- `GET /api/v1/meta/oauth/callback`
- `POST /api/v1/workspaces/{workspaceId}/meta/connections/{connectionId}/reconnect`
- `DELETE /api/v1/workspaces/{workspaceId}/meta/connections/{connectionId}`
- `POST /api/v1/workspaces/{workspaceId}/meta/sync`

## Ad Accounts
- `GET /api/v1/workspaces/{workspaceId}/ad-accounts`
- `GET /api/v1/ad-accounts/{adAccountId}`

## Campaigns
- `GET /api/v1/ad-accounts/{adAccountId}/campaigns`
- `GET /api/v1/campaigns/{campaignId}`
- `PATCH /api/v1/campaigns/{campaignId}`

## Ad Sets
- `GET /api/v1/campaigns/{campaignId}/ad-sets`
- `GET /api/v1/ad-sets/{adSetId}`
- `PATCH /api/v1/ad-sets/{adSetId}`

## Ads
- `GET /api/v1/ad-sets/{adSetId}/ads`
- `GET /api/v1/ads/{adId}`
- `PATCH /api/v1/ads/{adId}`

## Insights
- `GET /api/v1/insights`
- `POST /api/v1/insights/query`

## Chat / AI
- `POST /api/v1/conversations`
- `GET /api/v1/conversations`
- `GET /api/v1/conversations/{conversationId}`
- `POST /api/v1/conversations/{conversationId}/messages`
- `GET /api/v1/ai-runs/{runId}`

## Actions
- `GET /api/v1/actions`
- `GET /api/v1/actions/{actionId}`
- `POST /api/v1/actions/{actionId}/cancel`

## Approvals
- `GET /api/v1/approvals`
- `POST /api/v1/approvals/{approvalId}/approve`
- `POST /api/v1/approvals/{approvalId}/reject`

## Reports
- `POST /api/v1/reports`
- `GET /api/v1/reports/{reportId}`

## Webhooks
- `GET /webhooks/meta`
- `POST /webhooks/meta`

Exact endpoint implementation may be adjusted during API review, but domain boundaries must remain consistent.
