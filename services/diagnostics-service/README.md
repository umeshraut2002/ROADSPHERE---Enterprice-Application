# diagnostics-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Apply documented synthetic thresholds to telemetry and track alert lifecycle and deduplication.
- **API prefix:** `/api/v1/diagnostics`
- **Port:** `8090`
- **Data owned:** diagnostics schema
- **Upstream dependencies:** vehicle-registry-service
- **Downstream consumers:** notification-service,audit-service,fleet-analytics-service
- **Produced events:** DiagnosticAlertCreated.v1,DiagnosticAlertResolved.v1
- **Consumed events:** VehicleTelemetryReceived.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
