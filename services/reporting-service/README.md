# reporting-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Serve paginated operational reports from its own read model and bounded time ranges.
- **API prefix:** `/api/v1/reports`
- **Port:** `8103`
- **Data owned:** reporting schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** None
- **Produced events:** None
- **Consumed events:** TripCompleted.v1,ChargingSessionCompleted.v1,DiagnosticAlertCreated.v1,AuditRecordCreated.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
