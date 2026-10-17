# subscription-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Apply plan transitions and derive synthetic entitlements; publish lifecycle changes.
- **API prefix:** `/api/v1/subscriptions`
- **Port:** `8085`
- **Data owned:** subscription schema
- **Upstream dependencies:** identity-service,promotions-service
- **Downstream consumers:** billing-service,notification-service,audit-service
- **Produced events:** SubscriptionChanged.v1
- **Consumed events:** SimulatedPaymentCompleted.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
