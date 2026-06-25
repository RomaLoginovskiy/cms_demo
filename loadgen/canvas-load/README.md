# canvas-load

Browser-first synthetic load generator for the canvas whiteboard app.

## Target URL (critical)

| Where loadgen runs | Where canvas is | Set `frontend_base_url` |
|--------------------|-----------------|-------------------------|
| **Kubernetes pod** | `canvas-frontend` Service | `http://canvas-frontend` (auto via env) |
| **Your Mac (npm start)** | Ingress `http://localhost/` | `http://localhost` |
| **Your Mac (webpack dev)** | `http://localhost:3000` | `http://localhost:3000` |

`localhost` inside a **pod** is the load pod itself — not your ingress. The admin UI on your laptop uses port-forward; Playwright inside the pod must use cluster DNS.

## Kubernetes

```bash
docker build -t demo-canvas-load:latest -f loadgen/canvas-load/Dockerfile loadgen/canvas-load
kubectl apply -f k8s/canvas-load-configmap.yaml
kubectl apply -f k8s/canvas-load-deployment.yaml
kubectl apply -f k8s/canvas-load-service.yaml
kubectl rollout restart deployment/canvas-load -n cms-demo

# Admin UI — http://localhost:8090 (LoadBalancer on Docker Desktop; minikube: run `minikube tunnel`)
kubectl get svc canvas-load -n cms-demo
```

Open http://localhost:8090 → Target should be `http://canvas-frontend` → **Resume**.

### Board prep (S2)

The admin UI **Board prep (S2)** section seeds board `loadgen-large` with 1300 Sticky shapes for large-board text-edit perf validation:

| Control | Action |
|---------|--------|
| **Seed loadgen-large (1300)** | `POST /api/control/seed-board` (uses effective target from config) |
| **Prepare S2** | Pause → seed → apply `large_board` scenario; click **Resume** when ready |
| **Large board** | Scenario button in the main scenario row |

Seeding uses the same effective target URL as loadgen (`resolveTargetUrl` — in-cluster `localhost` is rewritten to `http://canvas-frontend`).

API (for automation):

| Method | Path |
|--------|------|
| POST | `/api/control/seed-board` (body: optional `board_name`, `target_count`, `batch_size`) |

CLI alternative:

```bash
npm run seed-board -- --base-url http://localhost --count 1300 --board-name loadgen-large
```

### RUM demo scenarios (control UI)

The admin UI includes a **RUM demo scenarios** panel:

- **Batch presets** — `UC1 critical spike` (50× s01), `UC2 plan mix`, `UC4 version A/B`
- **s01–s14** — one button per scenario; restarts virtual users with `?rumDemo=1&scenario=…` on every board navigation
- **Disable RUM demo** — turns off `rum_batch` and restarts users

Each virtual user gets a distinct Playwright fingerprint (viewport, locale, timezone, geolocation, user agent). When `rum_batch` is enabled, URL `geo` and `browser` labels match that context. With `rum_batch` off, `browser.fingerprint.enabled` (default `true`) still diversifies contexts for synthetic load.

API (for automation):

| Method | Path |
|--------|------|
| GET | `/api/control/rum/scenarios` |
| POST | `/api/control/rum/scenario/:id` (body: optional `plan`, `version`, …) |
| POST | `/api/control/rum/batch/:preset` |
| POST | `/api/control/rum/disable` |

S06 requires `RUM_DEMO_ENABLED=true` on `canvas-backend`.

### Session pacing (RUM replay)

Use the admin UI **Session pacing (RUM replay)** panel (not ConfigMap/YAML) to randomly extend some virtual-user profile slices for Coralogix session recording:

1. Open http://localhost:8090
2. Enable **long sessions for RUM replay** (workshop defaults pre-fill on enable)
3. Click **Apply session pacing**, then **Resume**

~25% of VUs get longer slices and slower think time; others rotate on shorter caps. Changes apply to the next profile slice on running users (same browser context / RUM session id).

Verify from inside the pod:

```bash
kubectl exec -n cms-demo deploy/canvas-load -- wget -qO- http://canvas-frontend | head -5
```

## Local (npm)

```bash
dotnet run --project canvas-backend/src/Whiteboard.Api --urls http://localhost:8080
npm run start --prefix canvas-frontend   # or use k8s ingress at http://localhost/

npm ci --prefix loadgen/canvas-load && npm run build --prefix loadgen/canvas-load
npm run start --prefix loadgen/canvas-load -- --config loadgen/canvas-load/config/load.yaml
```

- Admin UI: http://localhost:8090
- Metrics: http://localhost:9091/metrics

## Spec

[spec/components/canvas-load-generator-browser.md](../../spec/components/canvas-load-generator-browser.md)
