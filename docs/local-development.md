# Local development

## Separate frontends

Each portal has its own `package.json`, lockfile, source, Vite config, and build artifact. From the repository root in PowerShell:

```powershell
npm.cmd --prefix frontends/customer-portal ci
npm.cmd --prefix frontends/fleet-operations ci
```

Start the local demo API in a separate terminal to enable fleet telemetry and shared demo state:

```powershell
npm.cmd --prefix services/local-demo-api test
npm.cmd --prefix services/local-demo-api start
```

Run the portals in separate terminals:

```powershell
npm.cmd --prefix frontends/customer-portal run dev -- --port 5174
npm.cmd --prefix frontends/fleet-operations run dev -- --port 5173
```

Alternatively, start the API and both portals together from the repository root:

```powershell
node scripts/dev.mjs
```

Open `http://localhost:5173` (fleet), `http://localhost:5174` (customer), and `http://localhost:8080/health/ready` (API). Press `Ctrl+C` once to stop all three processes. Use `node scripts/dev.mjs --smoke` to start them, check API readiness, vehicle pagination and CORS, create smoke registrations, confirm normalized duplicate rejection and owner isolation, verify read-after-write, confirm both portal documents respond, then stop them automatically. If `VEHICLE_REGISTRY_URL` is set, smoke mode skips writes to that configured registry. Set `RS_API_PORT`, `RS_FLEET_PORT`, or `RS_CUSTOMER_PORT` to change the local ports.

The registry, telemetry-ingestion, and vehicle-status services listen on ports `8083`, `8086`, and `8087` in Compose. The recommended local path is the full Compose stack because telemetry ingestion requires PostgreSQL, Kafka, and the registry. To run the Java services on the host, install Java 17+ and Maven 3.6.3+, provision the `vehicle_registry`, `telemetry_outbox`, and `vehicle_state` schemas with their scoped logins, start Kafka, and configure each service's database URL, username, and password. Set `ROADSPHERE_VEHICLE_REGISTRY_URL` for telemetry and status, and `ROADSPHERE_KAFKA_BOOTSTRAP_SERVERS` for telemetry and status. Run `mvn -f services/vehicle-registry-service/pom.xml spring-boot:run`, `mvn -f services/telemetry-ingestion-service/pom.xml spring-boot:run`, and `mvn -f services/vehicle-status-service/pom.xml spring-boot:run`. Set `VEHICLE_REGISTRY_URL`, `VEHICLE_STATUS_URL`, and `TELEMETRY_INGESTION_URL` for the API as applicable. The Fleet demo uses the synthetic owner ID `fleet-demo`; owner IDs are not authenticated. Portal requests use relative `/api` URLs: Vite proxies these to the local API in development, and the container web server proxies them to the API Service in Compose and Kubernetes.

Validate independently:

```powershell
npm.cmd --prefix frontends/customer-portal run build
npm.cmd --prefix frontends/customer-portal test
npm.cmd --prefix frontends/fleet-operations test
npm.cmd --prefix frontends/fleet-operations run build
npm.cmd --prefix services/local-demo-api test
```

`npm.ps1` may be blocked by Windows execution policy; `npm.cmd` avoids that PowerShell shim. The fleet portal loads synthetic vehicle state from the local API and sends telemetry, maintenance booking, and payment simulations to it; telemetry alerts, booking confirmations, and payment outcomes appear in its notification panel. When the API is offline, it falls back to browser-local demo behavior. The customer portal keeps garage changes, service bookings, simulated invoice settlement, and preferences in browser-local storage because the demo API has no customer authentication or ownership checks. Use **Preferences → Reset browser demo data** or clear the browser's site data to reset those changes. Set `VITE_API_BASE_URL` in a local `.env` file to point the fleet client at a different API; never put secrets in a `VITE_*` variable.

## Local Compose environment

With Docker Desktop running, start PostgreSQL, Kafka, the registry, telemetry ingestion, vehicle status, the API, and both portals from the workspace root:

```powershell
docker compose up --build
```

Open `http://localhost:5173` (fleet), `http://localhost:5174` (customer), `http://localhost:8080/health/ready` (API readiness), `http://localhost:8083/actuator/health/readiness` (registry), `http://localhost:8086/actuator/health/readiness` (telemetry ingestion), and `http://localhost:8087/actuator/health/readiness` (status). The API sends Fleet telemetry to the PostgreSQL outbox; Kafka delivers it asynchronously to the status projection. The local API reports acceptance before the status read model catches up. Diagnostics, notifications, and other workflow state remain in API memory. Published ports bind to loopback. All state is synthetic. PostgreSQL and Kafka are reachable only on the internal Compose network and use ephemeral storage. Stop the stack with `Ctrl+C`; `docker compose down` removes the containers and their data.

With the stack running, `node scripts/compose-smoke.mjs` waits for the portals and services, checks the eight registry seeds, registers synthetic records, confirms duplicate-owner plate conflicts, and exercises direct status validation plus the ingestion outbox, event replay, Kafka delivery, and eventual status projection. Running the check changes ephemeral database state until the stack is stopped.

The current environment has Docker CLI installed, but the Docker daemon is not running, so Compose startup/build has not been verified here.

Enable the local observability profile to start Prometheus and Grafana alongside the demo:

```powershell
docker compose --profile observability up --build
```

Open Prometheus at `http://localhost:9090` and Grafana at `http://localhost:3000`. Grafana is pre-provisioned with the local API dashboard; its local-only demo login is `admin` / `roadsphere-demo-only`. Both ports bind to loopback, and their data is ephemeral. Prometheus scrapes the local API and all three Java services; the API exports request counts at `/metrics`. Docker daemon is unavailable in this environment, so these containers and dashboard rendering have not been runtime-verified.

## Local Kubernetes

The Kustomize package uses the same `roadsphere/*:dev` images as Compose. The registry, telemetry, and status services require reachable PostgreSQL endpoints and namespaced Secrets (`vehicle-registry-db`, `telemetry-ingestion-db`, and `vehicle-status-db`) with keys `url`, `username`, and `password`. Telemetry and status also require a `roadsphere-kafka` Secret with `bootstrap-servers`; the current client only supports plaintext local Kafka, so production SASL/TLS support is still required. Provision schemas, dependencies, and Secrets before applying the package. With Docker available, build the images, create the namespace once, and apply the namespaced package:

```powershell
docker compose build
kubectl config current-context
kubectl apply -f deploy/kubernetes/base/namespace.yaml
kubectl apply -k deploy/kubernetes/base
kubectl -n roadsphere-demo rollout status deployment/local-demo-api
kubectl -n roadsphere-demo rollout status deployment/vehicle-registry-service
kubectl -n roadsphere-demo rollout status deployment/telemetry-ingestion-service
kubectl -n roadsphere-demo rollout status deployment/vehicle-status-service
kubectl -n roadsphere-demo rollout status deployment/fleet-operations
kubectl -n roadsphere-demo rollout status deployment/customer-portal
```

Use port-forward terminals to make the demo services available to the browser on loopback:

```powershell
kubectl -n roadsphere-demo port-forward service/local-demo-api 8080:8080
kubectl -n roadsphere-demo port-forward service/vehicle-registry-service 8083:8083
kubectl -n roadsphere-demo port-forward service/telemetry-ingestion-service 8086:8086
kubectl -n roadsphere-demo port-forward service/vehicle-status-service 8087:8087
kubectl -n roadsphere-demo port-forward service/fleet-operations 5173:5173
kubectl -n roadsphere-demo port-forward service/customer-portal 5174:5174
```

The manifests use non-root containers, read-only root filesystems, dropped capabilities, restricted Pod Security Admission, probes, and per-container resource bounds. The API uses the registry for metadata and sends telemetry through the outbox/Kafka/status path; its demo workflows remain in memory. These manifests require PostgreSQL and Kafka endpoints/Secrets but do not provision either dependency. No service authenticates users, so use this only on a local learning cluster. Remove the namespaced workloads with `kubectl delete -k deploy/kubernetes/base`, then remove the empty demo namespace with `kubectl delete namespace roadsphere-demo` after stopping port forwards. Applying the package and checking live pods require a running cluster, built images, PostgreSQL, Kafka, and the service Secrets.

## Continuous integration

`Jenkinsfile` validates the service catalog, runs the API and three current target-service Maven suites, builds both portals, smoke-tests local and Compose applications, validates Terraform, and renders Kustomize. On the `main` branch it can publish immutable build-tagged images to ECR. Setting `DEPLOY_TO_EKS` requests an explicit Jenkins approval, then updates the named EKS cluster and waits for each rollout. Configure a Linux Jenkins agent labelled `node22-docker-linux` with Java 17+, Maven 3.6.3+, Node.js 22, npm, Docker Engine, Docker Compose v2, AWS CLI, kubectl, and Terraform 1.15 or later. A deployment agent must run inside the EKS VPC and use the `roadsphere-jenkins-agent` EC2 instance profile created by Terraform; create the `roadsphere-demo` namespace once with cluster-admin access before enabling the deploy stage. Maven dependencies and Terraform providers need registry access. This workspace has no Jenkins controller or AWS account, so the pipeline and cloud stages have not run here.

## Services

The 25 `services/<service-name>` folders have separate manifests, ownership boundaries, API prefixes, port allocations, and dependency/event metadata. `vehicle-registry-service`, `telemetry-ingestion-service`, and `vehicle-status-service` have partial executable Spring modules; the other 22 remain specifications. `services/local-demo-api` is a separate Node.js learning adapter, not a replacement for those services. Kafka runtime validation, other domain services and stores, and production authentication remain outstanding.

## Cleanup

The Compose PostgreSQL data is ephemeral tmpfs storage, so stopping/removing the database container resets the registry without a volume deletion. Do not remove project or user data with recursive filesystem commands as part of setup.
