# invoice-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Create immutable invoice records from billing outcomes and render sample downloadable documents.
- **API prefix:** `/api/v1/invoices`
- **Port:** `8099`
- **Data owned:** invoice schema
- **Upstream dependencies:** billing-service,payment-simulator
- **Downstream consumers:** customer-profile-service
- **Produced events:** InvoiceGenerated.v1
- **Consumed events:** ChargeCalculated.v1,SimulatedPaymentCompleted.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
