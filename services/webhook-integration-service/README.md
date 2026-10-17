# webhook-integration-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Store signed webhook registrations, deliver events asynchronously, bound retries, and retain delivery history.
- **API prefix:** `/api/v1/webhooks`
- **Port:** `8105`
- **Data owned:** webhook schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** audit-service
- **Produced events:** WebhookDeliverySucceeded.v1,WebhookDeliveryExhausted.v1
- **Consumed events:** DiagnosticAlertCreated.v1,TripCompleted.v1,InvoiceGenerated.v1,SubscriptionChanged.v1

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
