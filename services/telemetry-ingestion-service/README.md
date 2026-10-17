# Telemetry ingestion service

**Status: in progress.** This Spring Boot service validates the shared `VehicleTelemetryReceived.v1` event, checks that the vehicle exists through the registry API, and stores an idempotent outbox record in its owned PostgreSQL schema before acknowledging the request. The outbox publisher sends the event to `roadsphere.telemetry.received.v1`, keyed by `vehicleId`, and carries `eventId` and `correlationId` as Kafka headers. A broker outage leaves accepted events in PostgreSQL for later retry. The delivery guarantee is at least once: a crash after Kafka accepts a message but before the outbox is marked published can produce a duplicate, so consumers must remain idempotent.

`vehicle-status-service` consumes the event, applies its existing duplicate-safe database projection, retries delivery with bounded backoff, and sends exhausted records to `roadsphere.telemetry.received.v1.dlq`. The local HTTP projection endpoint on the status service remains available for focused service checks; the fleet demo API uses this ingestion API and the Kafka route. The DLT handler logs event payload length without logging telemetry contents. The remaining catalog consumers and a `VehicleStatusUpdated.v1` publisher are not implemented.

## Run locally

The Compose stack includes PostgreSQL, the Apache Kafka single-node development broker, vehicle registry, telemetry ingestion, vehicle status, the local API, and both portals. From the workspace root:

```powershell
docker compose up --build
node scripts/compose-smoke.mjs
```

The broker is a single node with one replica per topic for learning use only. It has no authentication, TLS, or persistent broker volume. The current Java Kafka client is configured for plaintext local development; SASL/TLS production client support and its Kubernetes secret fields must be added before connecting it to a secured managed cluster such as Amazon MSK.

For a host-run service, configure `ROADSPHERE_DB_URL`, `ROADSPHERE_DB_USERNAME`, `ROADSPHERE_DB_PASSWORD`, `ROADSPHERE_VEHICLE_REGISTRY_URL`, `ROADSPHERE_KAFKA_BOOTSTRAP_SERVERS`, and `ROADSPHERE_BIND_ADDRESS`. The Compose credentials are synthetic local-only values. `mvn -f services/telemetry-ingestion-service/pom.xml verify` runs the service checks; Docker/Testcontainers coverage requires a running Docker daemon.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/actuator/health/liveness` | Process liveness |
| GET | `/actuator/health/readiness` | Database readiness; the durable outbox can accept while Kafka is temporarily unavailable |
| GET | `/actuator/prometheus` | Prometheus metrics |
| POST | `/api/v1/telemetry` | Validate, registry-check, deduplicate, and durably enqueue a telemetry event |

The request body follows [`VehicleTelemetryReceived.v1`](../../contracts/events/vehicle-telemetry-received.v1.schema.json). An optional `X-Correlation-ID` is persisted and attached to the Kafka record as a header. Identical event IDs return `200 DUPLICATE`; a reused event ID with a different body returns `409`. Published outbox rows are removed after 90 days, so this local demo retains event-ID deduplication for that period.
