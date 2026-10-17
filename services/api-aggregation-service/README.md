# api-aggregation-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Serve bounded dashboard aggregation with per-downstream timeouts, authentication forwarding, and response correlation.
- **API prefix:** `/api/v1/dashboard`
- **Port:** `8080`
- **Data owned:** None; read through owner APIs
- **Upstream dependencies:** identity-service
- **Downstream consumers:** vehicle-registry-service,vehicle-status-service,trip-management-service,diagnostics-service,charging-session-service,maintenance-service,invoice-service,fleet-analytics-service
- **Produced events:** None
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
