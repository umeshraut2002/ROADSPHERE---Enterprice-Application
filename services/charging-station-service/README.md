# charging-station-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Publish synthetic station inventory, connector types, power, and availability snapshots.
- **API prefix:** `/api/v1/charging-stations`
- **Port:** `8094`
- **Data owned:** station schema
- **Upstream dependencies:** None
- **Downstream consumers:** booking-service,charging-session-service,api-aggregation-service
- **Produced events:** StationAvailabilityChanged.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
