# charging-session-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Record simulated charging sessions, duration, energy, and illustrative EUR cost.
- **API prefix:** `/api/v1/charging-sessions`
- **Port:** `8093`
- **Data owned:** charging_session schema
- **Upstream dependencies:** identity-service,charging-station-service,vehicle-registry-service
- **Downstream consumers:** billing-service,fleet-analytics-service
- **Produced events:** ChargingSessionCompleted.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
