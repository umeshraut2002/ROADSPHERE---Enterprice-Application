# identity-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Authenticate synthetic users, issue and validate tokens, and assign CUSTOMER, FLEET_OPERATOR, and PLATFORM_ADMIN roles.
- **API prefix:** `/api/v1/identity`
- **Port:** `8081`
- **Data owned:** identity schema
- **Upstream dependencies:** None
- **Downstream consumers:** customer-profile-service,user-preferences-service,audit-service
- **Produced events:** UserAuthenticated.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
