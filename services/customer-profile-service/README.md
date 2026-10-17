# customer-profile-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Store and return customer account profiles with ownership-scoped access.
- **API prefix:** `/api/v1/customers`
- **Port:** `8082`
- **Data owned:** customer schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** audit-service
- **Produced events:** CustomerProfileChanged.v1
- **Consumed events:** UserAuthenticated.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
