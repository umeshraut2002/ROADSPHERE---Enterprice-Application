# notification-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Create in-app notices and record simulated email/push delivery outcomes based on preferences.
- **API prefix:** `/api/v1/notifications`
- **Port:** `8096`
- **Data owned:** notification schema
- **Upstream dependencies:** identity-service,user-preferences-service
- **Downstream consumers:** None
- **Produced events:** NotificationDelivered.v1,NotificationDeliveryFailed.v1
- **Consumed events:** DiagnosticAlertCreated.v1,MaintenanceScheduled.v1,SubscriptionChanged.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
