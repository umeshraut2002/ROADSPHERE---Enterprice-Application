# booking-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Prevent overlapping maintenance and charging reservations using transactional conflict checks.
- **API prefix:** `/api/v1/bookings`
- **Port:** `8095`
- **Data owned:** booking schema
- **Upstream dependencies:** identity-service,maintenance-service,charging-station-service
- **Downstream consumers:** notification-service,audit-service,billing-service
- **Produced events:** BookingConfirmed.v1,BookingCancelled.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
