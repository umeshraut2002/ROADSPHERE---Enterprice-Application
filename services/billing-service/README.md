# billing-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Calculate illustrative EUR line items for subscriptions, sessions, and service bookings.
- **API prefix:** `/api/v1/billing`
- **Port:** `8097`
- **Data owned:** billing schema
- **Upstream dependencies:** subscription-service,promotions-service
- **Downstream consumers:** payment-simulator,invoice-service
- **Produced events:** ChargeCalculated.v1
- **Consumed events:** ChargingSessionCompleted.v1,BookingConfirmed.v1,SubscriptionChanged.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
