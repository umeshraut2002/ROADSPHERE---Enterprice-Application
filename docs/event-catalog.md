# Event catalog

This catalog describes the intended producer-consumer links. A service event is considered implemented only when its producer, schema validation, consumer idempotency, retry/dead-letter behavior, metrics, and tests exist in code.

| Event/topic | Producer | Consumers | Partition key | Failure behavior |
| --- | --- | --- | --- | --- |
| `VehicleTelemetryReceived v1` / `roadsphere.telemetry.received.v1` | telemetry ingestion | vehicle status, location, trips, diagnostics | `vehicleId` | Validate v1 schema; bounded retry/backoff; `.dlq`; idempotency key `eventId`. |
| `VehicleStatusUpdated v1` / `roadsphere.vehicle.status.updated.v1` | vehicle status | API aggregation, fleet analytics | `vehicleId` | Retry projection update; deduplicate source event. |
| `DiagnosticAlertCreated v1` / `roadsphere.diagnostic.alert.created.v1` | diagnostics | notification, maintenance, fleet analytics, webhooks, audit | `vehicleId` | Alert fingerprint dedupe; bounded retry; `.dlq`. |
| `TripCompleted v1` / `roadsphere.trip.completed.v1` | trip management | reporting, fleet analytics, webhooks | `vehicleId` | Consumer checkpoints; idempotency by trip ID. |
| `ChargingSessionCompleted v1` / `roadsphere.charging.session.completed.v1` | charging session | billing, reporting, fleet analytics | `vehicleId` | Retry billing/outbox; dedupe by session ID. |
| `BookingConfirmed v1` / `roadsphere.booking.confirmed.v1` | booking | notification, billing, audit | `customerId` | Transactional outbox planned; dedupe by booking ID. |
| `SubscriptionChanged v1` / `roadsphere.subscription.changed.v1` | subscription | billing, notification, audit, webhooks | `customerId` | Outbox and idempotent lifecycle projection. |
| `InvoiceGenerated v1` / `roadsphere.invoice.generated.v1` | invoice | customer portal, webhooks | `customerId` | Immutable invoice ID; bounded retry. |
| `SimulatedPaymentCompleted v1` / `roadsphere.payment.simulated.completed.v1` | payment simulator | invoice, subscription, audit, notification | `invoiceId` | Simulation only; deduplicate by `paymentAttemptId`. |

At-least-once message delivery is expected. Business correctness depends on consumers enforcing idempotency and using an outbox for events coupled to database transactions. Kafka's producer settings do not automatically make service-side effects exactly-once.

The first shared schema is [`VehicleTelemetryReceived v1`](../contracts/events/vehicle-telemetry-received.v1.schema.json). `telemetry-ingestion-service` accepts this event at `/api/v1/telemetry`, validates it, checks the registry, and commits it to its PostgreSQL outbox before returning. The publisher keys the Kafka record by `vehicleId`; the event ID and correlation ID travel as headers. The `vehicle-status-service` listener retries up to four total deliveries with exponential backoff and routes exhausted failures to `roadsphere.telemetry.received.v1.dlq`. Its database projection is idempotent, covering duplicate delivery after publisher restarts. The local HTTP status ingress remains a direct projection adapter and does not traverse Kafka. Kafka, Maven, and PostgreSQL runtime behavior remain unverified here. Other event schemas and consumers are not implemented.
