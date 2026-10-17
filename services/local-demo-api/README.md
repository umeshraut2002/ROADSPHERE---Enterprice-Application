# RoadSphere local demo API

This is a dependency-free Node.js API adapter for the local learning demo. It is not one of the planned Spring Boot domain services and does not replace the production target architecture. Bookings, alerts, and notifications use synthetic in-memory state and reset whenever the process restarts. When `VEHICLE_REGISTRY_URL` is set, vehicle metadata and registrations use that registry; when `VEHICLE_STATUS_URL` is set, telemetry events are forwarded to the status service and its latest projection is read back. Compose sets both URLs. Without those services, the adapter keeps metadata and telemetry projections in memory. The adapter has no user authentication; run it only on localhost.

## Run

From the workspace root:

```powershell
npm.cmd --prefix services/local-demo-api test
npm.cmd --prefix services/local-demo-api start
```

The API listens on `127.0.0.1:8080` by default. Set `PORT` to change the port. `HOST=0.0.0.0` is intended only inside the local Compose network/container; the Compose port is bound to loopback.

Set `VEHICLE_REGISTRY_URL` and `VEHICLE_STATUS_URL` to compatible service base URLs to enable durable vehicle metadata and status projections. Readiness follows configured dependencies. The Fleet demo assigns registrations to the synthetic `fleet-demo` owner; this is not authenticated ownership.

## Routes

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | Process readiness |
| GET | `/metrics` | Prometheus text-format request counters with bounded route labels |
| GET | `/api/v1/vehicles?page=0&size=50` | Paginated synthetic fleet |
| GET | `/api/v1/vehicles/{vehicleId}` | Synthetic vehicle details |
| POST | `/api/v1/vehicles` | Register a synthetic vehicle; metadata uses the configured registry or process memory |
| POST | `/api/v1/telemetry` | Validate, deduplicate, evaluate one synthetic event, and forward its projection when `VEHICLE_STATUS_URL` is configured |
| GET | `/api/v1/diagnostics?page=0&size=50` | Recent synthetic alerts |
| GET | `/api/v1/activity?page=0&size=50` | Recent telemetry and booking activity |
| GET | `/api/v1/notifications?page=0&size=50` | In-process notices created for telemetry alerts, bookings, and payment simulations |
| GET | `/api/v1/bookings?page=0&size=50` | Simulated bookings |
| POST | `/api/v1/bookings` | Confirm a 30-minute simulated booking; overlapping vehicle bookings return 409 |
| GET | `/api/v1/invoices?page=0&size=50` | Illustrative invoice records |
| POST | `/api/v1/payments/simulate` | Deterministic success/failure/retry simulation with attempt-ID idempotency; never contacts an external payment system |

Errors use `application/problem+json` with `requestId`. The API accepts a valid `X-Correlation-ID` or generates an opaque request ID. Event IDs and payment attempt IDs are idempotent in process memory: identical replay returns the recorded result; reuse with a different body returns `409 Conflict`. Telemetry older than the current vehicle projection is rejected. Telemetry body size is capped at 16 KiB, pagination size at 100, and active booking history at 1,000 records.

Vehicle registration accepts exactly `{ "ownerId": "fleet-demo", "plate": "B-RS 7312", "make": "Volvo", "model": "EX90", "modelYear": 2025 }` and returns `201` with `{ "vehicle": ..., "registryBacked": true|false }`. Plates are unique per owner after removing spaces and hyphens; conflicts return `409`. The request owner is demo data, not an authenticated identity.

All coordinates, vehicles, events, maintenance slots, and derived alerts are fabricated. The API never sends a physical vehicle command, calls a payment rail, or contacts a third-party service. CORS is limited by default to the two local portal origins and can be changed with `CORS_ORIGINS`.
