# location-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Retain and query synthetic location samples with bounded time windows and retention.
- **API prefix:** `/api/v1/locations`
- **Port:** `8088`
- **Data owned:** location schema
- **Upstream dependencies:** vehicle-registry-service
- **Downstream consumers:** api-aggregation-service,trip-management-service
- **Produced events:** VehicleLocationRecorded.v1
- **Consumed events:** VehicleTelemetryReceived.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
