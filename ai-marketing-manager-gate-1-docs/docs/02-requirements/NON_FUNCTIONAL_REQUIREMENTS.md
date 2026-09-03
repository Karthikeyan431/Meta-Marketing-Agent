# Non-Functional Requirements
**Document ID:** REQ-002 | **Version:** 1.0

## Security
NFR-001: Sensitive credentials shall be encrypted/protected at rest and in transit.
NFR-002: Secrets shall not appear in application logs.
NFR-003: Tenant isolation shall be enforced server-side.
NFR-004: Authentication and authorization failures shall fail closed.
NFR-005: AI-generated actions shall not bypass application security controls.

## Reliability
NFR-010: External API failures shall be handled explicitly.
NFR-011: Retryable failures shall use bounded retry/backoff behavior.
NFR-012: Mutating external operations shall have idempotency protection where supported.
NFR-013: Required actions shall produce durable audit records.

## Performance
NFR-020: Read APIs should return within agreed product SLAs under normal load.
NFR-021: Long-running work shall be asynchronous.
NFR-022: Chat requests shall provide progress/status for operations that cannot complete synchronously.

## Scalability
NFR-030: Architecture shall support horizontal scaling of stateless application components.
NFR-031: Background work shall be horizontally scalable.
NFR-032: Database access patterns shall be designed for tenant-aware indexing.

## Observability
NFR-040: Application errors shall be observable.
NFR-041: Background jobs shall expose status and failure information.
NFR-042: AI runs and tool calls shall have traceable identifiers.
NFR-043: Security-relevant events shall be auditable.

## Maintainability
NFR-050: Core domains shall have clear module boundaries.
NFR-051: External Meta integration shall be isolated behind an adapter.
NFR-052: Public contracts shall be versioned/managed.
NFR-053: Architecture changes shall be documented.

## AI Quality
NFR-060: AI outputs that drive mutations shall be schema validated.
NFR-061: AI evaluation shall include representative and adversarial cases.
NFR-062: The system shall distinguish facts from inference where reporting explanations involve uncertainty.
