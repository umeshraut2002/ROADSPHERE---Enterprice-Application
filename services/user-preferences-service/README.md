# user-preferences-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Manage locale, notification channel choices, and customer display settings.
- **API prefix:** `/api/v1/preferences`
- **Port:** `8084`
- **Data owned:** preferences schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** notification-service
- **Produced events:** PreferencesChanged.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
