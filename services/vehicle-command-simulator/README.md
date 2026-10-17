# vehicle-command-simulator

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Accept allow-listed nonphysical refresh requests and record their simulated completion.
- **API prefix:** `/api/v1/vehicle-commands`
- **Port:** `8091`
- **Data owned:** command schema
- **Upstream dependencies:** identity-service,vehicle-registry-service
- **Downstream consumers:** vehicle-status-service,audit-service
- **Produced events:** SimulatedVehicleCommandCompleted.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
