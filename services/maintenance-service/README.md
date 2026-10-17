# maintenance-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Maintain service schedules and records; surface due maintenance from synthetic mileage and diagnostics.
- **API prefix:** `/api/v1/maintenance`
- **Port:** `8092`
- **Data owned:** maintenance schema
- **Upstream dependencies:** identity-service,vehicle-registry-service,diagnostics-service
- **Downstream consumers:** booking-service,notification-service,billing-service
- **Produced events:** MaintenanceScheduled.v1,MaintenanceCompleted.v1
- **Consumed events:** DiagnosticAlertCreated.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
