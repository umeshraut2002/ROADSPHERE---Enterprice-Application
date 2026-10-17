# Event contracts

Events are asynchronous business messages, not RPC calls. Producers publish versioned schemas to Kafka topics; consumers validate each event, deduplicate by `eventId`, retry bounded transient failures with backoff, and route exhausted or invalid messages to a dead-letter topic. Kafka delivery by itself does not guarantee exactly-once business effects.

## VehicleTelemetryReceived v1

- Schema: [`vehicle-telemetry-received.v1.schema.json`](vehicle-telemetry-received.v1.schema.json)
- Producer: `telemetry-ingestion-service`
- Consumers: `vehicle-status-service`, `location-service`, `trip-management-service`, `diagnostics-service`
- Topic: `roadsphere.telemetry.received.v1`
- Partition key: `vehicleId`
- Duplicate key: `eventId`
- Failure behavior: retry transient consumer errors with bounded exponential backoff; send invalid/permanently failed records to `roadsphere.telemetry.received.v1.dlq`; expose consumer lag and DLQ count.
- Retention: synthetic high-frequency telemetry retention will be configurable and documented before persistence is enabled.
