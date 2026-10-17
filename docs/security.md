# Security and deployment boundaries

RoadSphere is a training system, not a certified financial, automotive, or vehicle-control platform. All sample users, locations, vehicles, and charges are synthetic. The payment simulator must never call a payment network; simulated vehicle commands must never reach a physical vehicle.

## Current implementation boundary

- Both independent frontends present an explicitly labelled demo mode with synthetic sample data. The fleet portal can connect to the localhost-only learning API.
- The customer portal's sign-in is a UI demonstration and does not authenticate an account.
- The local demo API has no token issuer, password store, authentication, or authorization checks. Its synthetic in-memory state is not a database. No real payment connection or cloud resource is configured.
- The Compose file binds the demo API and portals to `127.0.0.1`; do not change that binding or publish the unauthenticated API to a shared network.
- The optional observability profile uses the fixed `admin` / `roadsphere-demo-only` Grafana demo login and ephemeral local storage. Keep it on loopback and never reuse that password outside this learning stack.
- Frontend environment variables are public at build time. Never place API keys, passwords, private signing keys, or cloud credentials in `VITE_*` variables.

## Required before connecting real services

- Use Spring Security with short-lived signed access tokens or a documented identity provider; validate issuer, audience, expiry, and signing key rotation.
- Enforce `CUSTOMER`, `FLEET_OPERATOR`, and `PLATFORM_ADMIN` roles and check ownership inside every service.
- Store password hashes only if local passwords are supported; use Argon2id or BCrypt with managed parameters.
- Restrict CORS to the two known portal origins. Use TLS outside localhost.
- Keep database credentials scoped per service, keep internal services private, and use Kubernetes RBAC/service accounts with least privilege.
- Audit sensitive access; redact tokens, passwords, and customer identifiers from structured logs.
- Validate all inputs and event schemas; bound request sizes, timeouts, retries, and pagination.
- Scan dependencies and images before publishing; pin production images and avoid secrets in images or manifests.
