# RoadSphere

RoadSphere is a synthetic connected-mobility learning project. It is not a real vehicle-control system, bank, or production fleet. All sample people, vehicles, events, and EUR charges are illustrative; payments are simulations only.

> **Implementation status:** Local demo in progress. The fleet portal connects to a synthetic local API for vehicle state and telemetry; the full Spring/Kafka/PostgreSQL platform is not implemented. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for verified progress and limitations.

## Workspace status

The workspace contains two Vite portals, a local Node.js learning API, and three in-progress Spring Boot target services: `vehicle-registry-service`, `telemetry-ingestion-service`, and `vehicle-status-service`. The telemetry flow includes a durable outbox and Kafka consumer path; its Java runtime and broker integration still need verification. The Node learning API is a temporary synthetic adapter, not one of those target services. No cloud resources are created by this repository setup.

## Local development

For portal and API commands, see [docs/local-development.md](docs/local-development.md). Node.js 22 and npm 11 are required. Docker Compose needs Docker Desktop running. Maven and Helm were not found during the initial tooling inspection. PowerShell blocks `npm.ps1`; use `npm.cmd` from PowerShell.

Quick start from PowerShell after cloning:

```powershell
npm.cmd --prefix services/local-demo-api ci
npm.cmd --prefix frontends/fleet-operations ci
npm.cmd --prefix frontends/customer-portal ci
node scripts/dev.mjs
```

Open `http://localhost:5173` for fleet operations and `http://localhost:5174` for the customer portal. Press `Ctrl+C` to stop the local processes. Run `node scripts/dev.mjs --smoke` to verify the local API, Fleet registration and duplicate handling, and both portals automatically. The smoke run uses process-local registration and skips registry writes when `VEHICLE_REGISTRY_URL` is configured.

## Deployment

Terraform foundations for a versioned state bucket, private ECR repositories, and a private EKS cluster with EC2 managed nodes are in [deploy/terraform](deploy/terraform). They have not been applied. Production database, public ingress/TLS, application authentication, and the full service platform remain unfinished; the requested end-to-end deployment guide will follow after those foundations are ready. Never put AWS credentials in this repository.
