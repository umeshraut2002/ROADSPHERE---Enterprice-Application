# Vehicle registry service

**Status: in progress.** This is the first target service with an independent Spring Boot 4.1.1 module definition and implementation source, targeting Java 17 bytecode. It implements synthetic vehicle reads and registration on port `8083`, backed by PostgreSQL through JDBC. The database owner provisions the `vehicle_registry` schema for the registry login; Flyway creates its tables and inserts eight synthetic seed vehicles within that schema. PostgreSQL runtime, configured Boot 4 build, and migrations have not been verified in this environment because Maven is missing and Docker is unavailable. Authenticated owner identity, audit events, and Kafka publication remain outstanding.

## Run and test

Requires Java 17 or later and Maven 3.6.3 or later. `mvn test` runs unit tests and PostgreSQL integration tests through Testcontainers; the integration test class skips when Docker is unavailable. Running the service requires a reachable PostgreSQL database with the `vehicle_registry` schema owned by its login. Compose starts PostgreSQL for the containerized stack but does not publish its database port, so a service started directly on the host needs another reachable database. From the workspace root:

```powershell
mvn -f services/vehicle-registry-service/pom.xml test
mvn -f services/vehicle-registry-service/pom.xml spring-boot:run
```

The service binds to `127.0.0.1:8083`. Set `PORT` or `ROADSPHERE_BIND_ADDRESS` to change the port or bind address. Set `ROADSPHERE_DB_URL`, `ROADSPHERE_DB_USERNAME`, and `ROADSPHERE_DB_PASSWORD` to use another PostgreSQL instance; the checked-in defaults and Compose credentials are synthetic local-demo values only. The container sets the bind address to `0.0.0.0` behind a loopback-published Compose port.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/actuator/health/liveness` | Process liveness |
| GET | `/actuator/health/readiness` | Process readiness |
| GET | `/actuator/metrics` | Spring Actuator metrics index |
| GET | `/api/v1/vehicles?page=0&size=50` | Paginated synthetic registry |
| GET | `/api/v1/vehicles/{vehicleId}` | Vehicle details |
| POST | `/api/v1/vehicles` | Register a synthetic vehicle |

Registration accepts `ownerId`, `plate`, `make`, `model`, and `modelYear`. It rejects invalid fields with `400` and a duplicate normalized plate for the same owner with `409`. The same synthetic plate may belong to different owners. Domain, request-body, and type-conversion errors use `application/problem+json` without exposing parsing details.

All records and owner IDs are fabricated. There is no authentication or authorization, so the submitted `ownerId` is not proof of ownership. Do not expose this learning service beyond localhost. Before connecting real accounts, derive owner identity from an authenticated principal, add audit/outbox handling, and publish `VehicleRegistered.v1` through the documented outbox workflow.
