# Service catalog

These are the 25 target bounded contexts. Check each `service.yaml` and `docs/IMPLEMENTATION_STATUS.md` for its current implementation state. Vehicle registry, telemetry ingestion, and vehicle status are in progress; the other 22 target services remain planned. Each service requires its own build artifact, API contract, validation, health probes, metrics/logging/tracing, tests, Dockerfile, resource-bounded deployment, and security notes.

The registry uses JDBC and Flyway for its owned schema, synthetic seed, and REST API. Telemetry ingestion validates the shared event, checks registry membership through REST, and writes an idempotent PostgreSQL outbox before acknowledging; its publisher sends keyed Kafka messages with correlation headers and retry scheduling. Vehicle status consumes the topic with bounded retries and a `.dlq`, then applies the existing idempotent JDBC/Flyway projection. The Compose Kafka broker is a single-node development dependency. Maven, the Boot 4 builds, migrations, and container startup still need runtime verification; the other 22 target services remain specifications.

| # | Service | Responsibility | Primary dependencies |
| ---: | --- | --- | --- |
| 1 | identity-service | Authentication, token validation, roles | Identity schema |
| 2 | customer-profile-service | Customer account details | Customer schema |
| 3 | vehicle-registry-service | Vehicle metadata and ownership | Vehicle registry schema |
| 4 | user-preferences-service | Locale and notification preferences | Preferences schema |
| 5 | subscription-service | Plans, entitlements, lifecycle | Subscription schema; Kafka |
| 6 | telemetry-ingestion-service | Validate and publish synthetic telemetry | Telemetry schema; Kafka |
| 7 | vehicle-status-service | Latest state projection | Kafka; vehicle-state schema |
| 8 | location-service | Synthetic location history | Kafka; location schema |
| 9 | trip-management-service | Simulated trip records | Kafka; trip schema |
| 10 | diagnostics-service | Threshold evaluation and alerts | Kafka; diagnostic schema |
| 11 | vehicle-command-simulator | Safe simulated refresh requests | Vehicle-status API |
| 12 | maintenance-service | Schedules and service records | Maintenance schema; Kafka |
| 13 | charging-session-service | Synthetic charging sessions | Charging schema; Kafka |
| 14 | charging-station-service | Station inventory and availability | Station schema |
| 15 | booking-service | Conflict-safe maintenance/charging reservations | Booking schema |
| 16 | notification-service | In-app and simulated delivery | Preferences API; Kafka |
| 17 | billing-service | Illustrative charge calculation | Subscription/service events |
| 18 | payment-simulator | Synthetic success/failure/retry outcomes | Billing API; Kafka |
| 19 | invoice-service | Invoice records and sample documents | Billing events; invoice schema |
| 20 | promotions-service | Eligibility and discount calculation | Promotion schema |
| 21 | api-aggregation-service | Bounded dashboard response composition | Explicit downstream APIs |
| 22 | audit-service | Security/business audit records | Audit schema |
| 23 | reporting-service | Paginated operational reports | Reporting read model |
| 24 | fleet-analytics-service | Health, usage, charging and utilization aggregates | Event projections |
| 25 | webhook-integration-service | Signed outbound webhooks, retry history | Webhook schema; Kafka |

Run `node scripts/validate-service-catalog.mjs` after changing a service manifest. The dependency-free check confirms all 25 target services agree across their manifests, directory names, this table, and `services/dependency-matrix.csv`; it also checks implementation-status values, port/prefix uniqueness, and dependency references. Jenkins runs the same check. A passing catalog check validates metadata only; it does not make a service executable.

## Initial port inventory

Final ports will be set in service configuration. Avoid collisions with local dependencies. The gateway will be the only externally exposed application API; database and broker ports remain development-only.

## Local learning adapter

`services/local-demo-api` is a runnable, dependency-free Node.js adapter used by the Compose learning environment. It implements synthetic vehicle reads and registration, telemetry projection, diagnostics, in-process notifications, maintenance bookings, and payment simulation for the fleet portal. In Compose it proxies vehicle metadata reads and writes to `vehicle-registry-service`, and submits telemetry to `telemetry-ingestion-service`; the durable outbox publishes to Kafka and the status service updates its projection asynchronously. Diagnostics and other workflow projections remain process-local. The adapter is not a Spring Boot domain service and does not count toward the 25 independently buildable services. Its port is `8080`; do not expose it beyond localhost.
