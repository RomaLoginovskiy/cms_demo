# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Backend build**: `dotnet build` (in `backend/`). Builds all .NET projects.
- **Backend run**: `dotnet run --project DemoCms.Api` (in `backend/`). Starts API on `https://localhost:7043`.
- **Backend test**: `dotnet test` (in `backend/`). Runs unit tests for media worker.
- **Frontend install**: `npm install` (in `frontend/`).
- **Frontend start**: `npm start` (in `frontend/`). Runs dev server on `http://localhost:3000`.
- **Frontend build**: `npm run build` (in `frontend/`). Produces production build in `build/`.
- **Frontend test**: `npm test` (in `frontend/`). Runs Jest/React tests.
- **E2E tests**: `npm test` (in `automated-tests/`). Runs Puppeteer scripts.
- **Docker build (backend)**: `docker build -t demo-cms-backend:latest -f Dockerfile .` (in `backend/`).
- **Docker build (media worker)**: `docker build -t demo-cms-media-worker:latest -f DemoCms.MediaWorker/Dockerfile .` (in `backend/`).
- **Docker build (frontend)**: `docker build -t demo-cms-frontend:latest -f Dockerfile .` (in `frontend/`).
- **K8s apply all**: `kubectl apply -k k8s/` (in root). Deploys all manifests.
- **K8s get status**: `kubectl get all -n cms-demo`.

## High‑Level Architecture

```
 ┌─────────────────────────────────────┐
 │          Frontend (React)           │
 │  /src (components, services, etc.) │
 └───────┬──────────────┬──────────────┘
         │              │
 ┌───────▼──────────────▼──────────────┐
 │          Ingress (NGINX)            │
 │  routes /api/* → Backend, / → Frontend │
 └───────┬──────────────┬──────────────┘
         │              │
 ┌───────▼──────────────▼──────────────┐
 │            Backend (ASP.NET Core)    │
 │  API, EF Core, OpenTelemetry, Coralogix │
 └───────┬──────────────┬──────────────┘
         │              │
 ┌───────▼──────────────▼──────────────┐
 │          Media Worker (Background)   │
 │  Processes media upload events       │
 └─────────────────────────────────────┘
```

* **Backend** hosts the REST API, manages media metadata via EF Core, and emits traces/metrics to OpenTelemetry Collector (configured to forward to Coralogix). It stores uploaded files under `uploads/`.
* **Frontend** is a React SPA using Tailwind CSS and Coralogix Browser SDK for RUM. It calls the API at `/api`.
* **Media Worker** listens to media events (via Kafka or in‑process queue) and processes uploads.
* **Observability**: OpenTelemetry (OTLP, Prometheus), Coralogix logs, metrics, and traces; Jaeger UI exposed at port 16686.

## Testing

* Unit tests are written with xUnit in `backend/DemoCms.MediaWorker.Tests`.
* E2E tests run Puppeteer scripts located in `automated-tests/`.

## Deployment

* Docker images are built for each component and can be deployed locally with the provided `k8s/` manifests.
* For minikube/kind, load images into the cluster before applying manifests.
* In production, use `helm` or `kustomize` to manage configurations.

## Configuration

| Component | Key | Description |
|-----------|-----|-------------|
| Backend   | `Storage:Path` | Filesystem path for uploads (default `/app/uploads`). |
| Backend   | `OpenTelemetry:OtlpEndpoint` | OTLP collector endpoint. |
| Frontend | `REACT_APP_API_URL` | API base URL; empty in dev, `/api` in production via NGINX. |
| Frontend | `BACKEND_HOST` | Backend host for Docker/Nginx. |

Use `.env` or `appsettings.json` for local overrides.

## Notes

- The repository follows a monorepo structure with separate `backend/` and `frontend/` directories.
- The Dockerfiles use multi‑stage builds to keep images small.
- The `k8s/` directory contains manifests for deployment, including Kafka, Prometheus, and Coralogix Agent.
- Run `dotnet tool install --global dotnet-format` for formatting, if desired.
