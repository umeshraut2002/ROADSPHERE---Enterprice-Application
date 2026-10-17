# trip-management-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Detect journey boundaries from status/location signals and expose paginated synthetic trip records.
- **API prefix:** `/api/v1/trips`
- **Port:** `8089`
- **Data owned:** trip schema
- **Upstream dependencies:** vehicle-registry-service,location-service
- **Downstream consumers:** reporting-service,fleet-analytics-service
- **Produced events:** TripCompleted.v1
- **Consumed events:** VehicleTelemetryReceived.v1,VehicleLocationRecorded.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
