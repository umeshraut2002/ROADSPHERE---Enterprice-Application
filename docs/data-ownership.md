# Data ownership

Each service owns its data and schema. Other services must use its API or subscribe to its versioned events rather than query its tables. Local development may run one PostgreSQL server with separate logical schemas and service-scoped credentials; production permissions must prevent cross-schema reads.

| Data set | Owner | Initial retention intent | Current state |
| --- | --- | --- | --- |
| Credentials, roles, sessions | identity-service | Retain account data only as long as needed for the synthetic exercise; revoke demo sessions quickly. | Planned |
| Synthetic profiles and preferences | customer-profile-service, user-preferences-service | Resettable demo records; no real PII. | Planned |
| Vehicle metadata and ownership | vehicle-registry-service | Keep while synthetic fleet fixture exists. | Migration source defines the registry table, unique owner/normalized-plate constraint, and eight-row synthetic seed. Compose provisions a schema-owned local login; database startup remains unverified. Authenticated ownership and production retention are not implemented. |
| Latest state | vehicle-status-service | Retain one current projection per synthetic vehicle; registry owns vehicle metadata. | Flyway stores the latest telemetry-derived battery, health, status, and coordinates in `vehicle_state.vehicle_status`. Event-ID fingerprints in `vehicle_state.telemetry_events` expire after 30 days. The Kafka consumer is idempotent; Kafka delivery and projection behavior still need runtime verification. Latest-coordinate retention needs review before production use. |
| Telemetry and coordinates | telemetry-ingestion-service, location-service | High-volume event history needs configurable short retention and partition expiry before long-term persistence. | `telemetry-ingestion-service` owns a PostgreSQL outbox, retries publication while Kafka is unavailable, and removes successfully published rows after 90 days. It does not keep a raw event history beyond that outbox window. The status projection stores current coordinates plus a 30-day idempotency receipt. Other telemetry/location stores remain planned. |
| Trips and diagnostics | trip-management-service, diagnostics-service | Retain synthetic summaries for the learning scenario; document TTL before production-like scale. | Planned |
| Charging and maintenance bookings | mobility service owners | Retain sample history for demonstration. | Planned |
| Subscription, billing, invoice, payment simulation | commercial service owners | Keep only synthetic records necessary for the exercise. | Planned |
| Audit events | audit-service | Append-only restricted records with explicit retention and export policy. | Planned |
| Reports and analytics | reporting-service, fleet-analytics-service | Rebuildable projections from retained events. | Planned |

The registry, telemetry outbox, and vehicle-status services have separate Flyway schemas and local service logins. Compose provisions their logins in the same ephemeral PostgreSQL instance; each service can access only its own schema. The local Kafka broker is unauthenticated and ephemeral. Production Kafka security, remaining service credentials, and domain retention policies remain outstanding.
