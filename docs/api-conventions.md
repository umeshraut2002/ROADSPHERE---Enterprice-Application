# API conventions

## Independent applications and shared gateway

`frontends/customer-portal` and `frontends/fleet-operations` are separate Vite applications with independent manifests and build outputs. Both use the configured API Gateway base URL from `VITE_API_BASE_URL`; browser bundles must never contain service credentials. The gateway owns browser-facing route mapping. Services also expose their own versioned API prefixes internally as defined in `services/<service>/service.yaml`.

## REST conventions

- Base path: `/api/v1` with plural nouns for collections.
- JSON request/response bodies use lower camel case and ISO 8601 UTC timestamps.
- Collection endpoints should support bounded pagination (`page`, `size`), stable sorting, and documented filter fields.
- Use `202 Accepted` for asynchronous event submission and return a correlation ID and event ID.
- Use `409 Conflict` for booking overlaps and idempotency-key reuse with a different request body.
- Use consistent `application/problem+json` errors with `type`, `title`, `status`, `detail`, `instance`, and `requestId`.
- `X-Correlation-ID` is accepted from a trusted gateway, validated, and propagated to logs, traces, and downstream calls. Generate a new opaque ID if absent or malformed.
- Set explicit request-size limits, downstream timeouts, and pagination bounds at the gateway.

## Authorization

The gateway authenticates incoming requests; every service still checks required role and resource ownership. Roles are `CUSTOMER`, `FLEET_OPERATOR`, and `PLATFORM_ADMIN`. The frontends currently show synthetic demo data and do not authenticate. This contract is a target, not an implemented security claim.

## Local demo API

Both portals contain a typed `ApiClient` configured through `VITE_API_BASE_URL`. The fleet portal reads `/api/v1/vehicles` and submits telemetry to `/api/v1/telemetry` when the local demo API is running. The local API also implements diagnostics, in-process notifications, activity, simulated booking, invoice, and payment outcome routes. Its state is in-memory and resets when it restarts; the customer portal keeps a limited set of demo changes in versioned browser-local storage, while trips, charging, and history remain fixtures. This adapter does not implement authentication, domain-owned databases, Kafka, or production service-to-service authorization.
