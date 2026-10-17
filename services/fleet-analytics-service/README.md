# fleet-analytics-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Aggregate utilization, health, charging, and vehicle availability from business event projections.
- **API prefix:** `/api/v1/fleet-analytics`
- **Port:** `8104`
- **Data owned:** analytics schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** api-aggregation-service,reporting-service
- **Produced events:** FleetMetricUpdated.v1
- **Consumed events:** VehicleStatusUpdated.v1,TripCompleted.v1,ChargingSessionCompleted.v1,DiagnosticAlertCreated.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
