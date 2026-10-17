# payment-simulator

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Generate deterministic synthetic authorized, declined, and retryable outcomes; never contact a payment rail.
- **API prefix:** `/api/v1/payment-simulations`
- **Port:** `8098`
- **Data owned:** payment_simulation schema
- **Upstream dependencies:** billing-service
- **Downstream consumers:** invoice-service,subscription-service,notification-service
- **Produced events:** SimulatedPaymentCompleted.v1,SimulatedPaymentFailed.v1
- **Consumed events:** ChargeCalculated.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
