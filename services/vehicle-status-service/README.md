# vehicle-status-service

**Status: in progress.** This is the second target Spring Boot service with application source. It owns the latest telemetry-derived state projection and a bounded event-ID idempotency receipt table in the `vehicle_state` schema.

- **Business responsibility:** Consume telemetry idempotently and maintain the latest state projection per registered vehicle.
- **API prefix:** `/api/v1/vehicle-status`
- **Port:** `8087`
- **Data owned:** vehicle_state schema
- **Upstream dependencies:** vehicle-registry-service
- **Downstream consumers:** api-aggregation-service,fleet-analytics-service
- **Planned produced event:** `VehicleStatusUpdated.v1` (not emitted yet)
- **Input event:** `VehicleTelemetryReceived.v1` is currently accepted through HTTP; the Kafka consumer is not implemented yet

## Local run

Provision PostgreSQL with a `vehicle_state` schema owned by the service login, then set `ROADSPHERE_DB_URL`, `ROADSPHERE_DB_USERNAME`, `ROADSPHERE_DB_PASSWORD`, and `ROADSPHERE_VEHICLE_REGISTRY_URL`. Run:

```powershell
mvn -f services/vehicle-status-service/pom.xml verify
mvn -f services/vehicle-status-service/pom.xml spring-boot:run
```

Flyway creates the projection and event receipt tables. The service checks registration through the registry API and never queries the registry schema directly. Compose starts both services against separate schema-scoped logins and ephemeral database storage.

## HTTP event ingress

`POST /api/v1/vehicle-status/events/telemetry-received` accepts the required JSON fields defined by `contracts/events/vehicle-telemetry-received.v1.schema.json`; omitted fields such as `batteryPercent` are rejected instead of being interpreted as zero. This local HTTP ingress lets the projection be exercised while Kafka wiring is pending; it is not a Kafka consumer. `202 Accepted` means the projection changed, `200 OK` reports an identical event replay, `409 Conflict` rejects reuse of an event ID with a different body or stale telemetry, and `404 Not Found` rejects vehicles absent from the registry.

`GET /api/v1/vehicle-status/{vehicleId}` returns the current projection. The collection route supports pages from 1 to 100 items. Status is `Charging`, `Driving`, or `Parked`; health thresholds match the local Fleet demo. The most recent state is durable. Event fingerprints used for idempotency expire after 30 days; this retention is a synthetic learning default, not a production policy.

The service has no user authentication. Do not expose it beyond the loopback-bound local environment.
