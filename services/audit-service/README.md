# audit-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Append security-sensitive and business audit records with restricted read access and defined retention.
- **API prefix:** `/api/v1/audit`
- **Port:** `8102`
- **Data owned:** audit schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** reporting-service
- **Produced events:** AuditRecordCreated.v1
- **Consumed events:** VehicleRegistered.v1,SubscriptionChanged.v1,BookingConfirmed.v1,SimulatedPaymentCompleted.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
