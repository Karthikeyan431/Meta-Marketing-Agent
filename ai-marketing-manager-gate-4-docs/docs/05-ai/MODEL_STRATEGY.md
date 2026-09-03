# AI Model Strategy
**Document ID:** AI-011 | **Version:** 1.0

## Principle
Use models according to task complexity, quality requirements, latency and cost.

## Routing Categories
### Lightweight
Simple classification, extraction and routing.

### General Reasoning
Complex analysis, planning and explanation.

### High-Risk
Actions affecting spend or campaign state should use the strongest validated reasoning path available within product economics.

## Model Independence
Application tool contracts and domain logic must remain provider-neutral where practical.

## Model Changes
Changing model/provider requires:
- evaluation
- regression testing
- cost assessment
- latency assessment
- safety review
