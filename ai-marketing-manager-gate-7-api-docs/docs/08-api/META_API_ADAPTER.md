# Meta API Adapter Contract
**Document ID:** API-009 | Version 1.0

## Purpose
Prevent Meta-specific details from leaking through the domain/API layers.

## Interface Examples
```text
MetaClient
 ├── getAdAccounts()
 ├── getCampaign()
 ├── listCampaigns()
 ├── getInsights()
 ├── createCampaign()
 ├── updateCampaign()
 ├── updateAdSet()
 ├── updateAd()
 └── verifyOperation()
```

## Adapter Responsibilities
- authentication
- version selection
- request construction
- pagination
- retries
- provider error mapping
- response normalization
- telemetry

## Domain Layer Must Not
- construct raw Meta URLs
- manage Meta access tokens
- depend on provider-specific error structures
- issue arbitrary provider operations
