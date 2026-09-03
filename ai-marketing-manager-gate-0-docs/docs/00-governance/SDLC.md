# Software Development Life Cycle
**Document ID:** GOV-002  
**Version:** 1.0  
**Status:** Draft for Approval

## 1. Lifecycle
The project follows:

1. Discovery
2. Requirements
3. Architecture
4. Detailed technical design
5. Development
6. Automated testing
7. Security and reliability validation
8. Manual UAT
9. Staging
10. Production release
11. Post-release monitoring
12. Continuous improvement

## 2. Mandatory Gates
### Gate 0 — Governance
Outputs:
- Project Charter
- SDLC
- Development Principles
- Definition of Done
- Change Management

### Gate 1 — Product and Requirements
Outputs:
- PRD
- personas
- user journeys
- functional requirements
- non-functional requirements
- user stories
- acceptance criteria
- traceability matrix

### Gate 2 — Architecture
Outputs:
- system architecture
- frontend/backend architecture
- worker/event architecture
- integration architecture
- ADRs

### Gate 3 — Data
Outputs:
- canonical data model
- database schema
- synchronization model
- retention strategy

### Gate 4 — AI
Outputs:
- agent architecture
- tool contracts
- context/memory
- goal engine
- optimization engine
- policy engine
- approval engine
- AI evaluation framework

### Gate 5 — Meta Integration
Outputs:
- current Meta API capability matrix
- OAuth flow
- permissions
- asset mapping
- operations
- insights
- rate limits
- error/retry behavior

### Gate 6 — Security
Outputs:
- threat model
- authentication
- authorization
- RBAC
- tenant isolation
- secret management
- AI security
- audit model

### Gate 7 — API
Outputs:
- API architecture
- contracts
- error model
- idempotency
- OpenAPI

### Gate 8 — UX/UI
Outputs:
- information architecture
- user flows
- screen specifications
- chat UX
- design system

### Gate 9 — Testing
Outputs:
- test strategy
- unit/integration/E2E/security/AI/performance tests
- UAT plan
- test cases

### Gate 10 — DevOps
Outputs:
- environments
- CI/CD
- infrastructure
- deployment
- backup/recovery
- disaster recovery

### Gate 11 — Development Readiness
Outputs:
- epics
- backlog
- implementation tasks
- Claude Code instructions
- repository baseline

Only after Gate 11 is approved does feature development begin.

## 3. Development Loop
For every task:

Read context → inspect code → plan → implement → test → verify → document → review → complete.

## 4. Change Control
Changes to approved requirements, architecture, security controls, database contracts, or public API contracts require a documented change and, where appropriate, an ADR.

## 5. Evidence-Based Completion
Claude must not report a task as complete without showing:
- files changed
- tests executed
- test results
- validation performed
- known limitations
- documentation updated where required
