# promotions-service

**Status: planned; application source and executable artifact are not implemented yet.** This directory defines the independent service boundary and contract. Do not treat the manifest as a deployed service.

- **Business responsibility:** Evaluate promotion eligibility, usage windows, and discount limits without applying money movement.
- **API prefix:** `/api/v1/promotions`
- **Port:** `8100`
- **Data owned:** promotion schema
- **Upstream dependencies:** identity-service
- **Downstream consumers:** subscription-service,billing-service
- **Produced events:** PromotionRedeemed.v1
- **Consumed events:** None

This service must own its Spring Boot build, configuration, validation, authorization, health/metrics endpoints, tests, Dockerfile, and deployment template. Cross-service table access is prohibited. Use REST through the gateway for immediate reads/commands and versioned Kafka events for asynchronous workflows. See `docs/event-catalog.md` and `docs/data-ownership.md`.
