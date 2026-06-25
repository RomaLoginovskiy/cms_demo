# Kubernetes Deployment for Demo CMS

This directory contains Kubernetes manifests for deploying the Demo CMS application with proper service communication and ingress routing.

## Architecture

```
                        ┌─────────────────┐
                        │  Ingress (Nginx)│
                        │   localhost     │
                        └────────┬────────┘
                                 │
            ┌────────────────────┴────────────────────┐
            │                                         │
       /api routes                              / routes
            │                                         │
    ┌───────▼────────┐                    ┌──────────▼────────┐
    │   Backend      │                    │    Frontend       │
    │  Service:8080  │                    │   Service:80      │
    └────────────────┘                    └───────────────────┘
```

## Prerequisites

1. **Kubernetes cluster** (minikube, kind, or any k8s cluster)
2. **kubectl** CLI tool installed
3. **NGINX Ingress Controller** installed

### Install NGINX Ingress Controller

For **minikube**:
```bash
minikube addons enable ingress
```

For **kind** or other clusters:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

Verify installation:
```bash
kubectl get pods -n ingress-nginx
```

## Building Docker Images

Before deploying, build the Docker images:

### Backend
```bash
cd backend
docker build -t demo-cms-backend:latest -f Dockerfile .
```

### Media Worker
```bash
cd backend
docker build -t demo-cms-media-worker:latest -f DemoCms.MediaWorker/Dockerfile .
```

### Frontend
```bash
cd frontend
docker build -t demo-cms-frontend:latest -f Dockerfile .
```

### For minikube (load images into minikube)
```bash
minikube image load demo-cms-backend:latest
minikube image load demo-cms-media-worker:latest
minikube image load demo-cms-frontend:latest
```

### For kind (load images into kind)
```bash
kind load docker-image demo-cms-backend:latest
kind load docker-image demo-cms-media-worker:latest
kind load docker-image demo-cms-frontend:latest
```

## Deployment

### Option 1: Deploy with PVC-safe script
```bash
./k8s/deploy.sh
```

### Option 2: Apply non-storage resources manually
```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create missing PVCs without patching existing bound claims
./k8s/deploy.sh --skip-build --no-images

# Directly applying k8s/persistent-volumes.yaml can fail on existing
# bound PVCs because Kubernetes makes storageClassName immutable.
```

## Verification

### Check deployment status
```bash
# Check all resources in the namespace
kubectl get all -n cms-demo

# Check pod status
kubectl get pods -n cms-demo

# Check services
kubectl get svc -n cms-demo

# Check ingress
kubectl get ingress -n cms-demo
```

### Check pod logs
```bash
# Backend logs
kubectl logs -n cms-demo -l app=backend --tail=50 -f

# Kafka logs
kubectl logs -n cms-demo -l app=kafka --tail=50 -f

# Media worker logs
kubectl logs -n cms-demo -l app=media-worker --tail=50 -f

# Frontend logs
kubectl logs -n cms-demo -l app=frontend --tail=50 -f
```

## Accessing the Application

### For minikube
```bash
# Get the minikube IP
minikube ip

# Add to /etc/hosts (replace <MINIKUBE-IP> with actual IP)
echo "<MINIKUBE-IP> localhost" | sudo tee -a /etc/hosts

# Or use minikube tunnel (recommended)
minikube tunnel
```

Then access:
- Frontend: http://localhost
- Backend API: http://localhost/api
- Load generator UI: http://localhost:8090 (LoadBalancer service `canvas-load`)

### For kind or other local clusters
```bash
# Port forward the ingress controller
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 80:80
```

Then access:
- Frontend: http://localhost
- Backend API: http://localhost/api

### For cloud clusters
Update the ingress host in `k8s/ingress.yaml` to your domain and ensure DNS is configured.

## Service Communication

Services communicate internally using Kubernetes DNS:
- Backend → OpenTelemetry Collector: `http://otel-collector:4318`
- Frontend → Backend (via Ingress): `http://localhost/api`

All external traffic goes through the Ingress controller which routes:
- `/api/*` → Backend service
- `/*` → Frontend service

## Scaling

Scale deployments:
```bash
# Scale backend
kubectl scale deployment backend -n cms-demo --replicas=3

# Scale frontend
kubectl scale deployment frontend -n cms-demo --replicas=3
```

## Configuration

### Environment Variables

Backend configuration is in `k8s/backend-deployment.yaml`:
- `ASPNETCORE_ENVIRONMENT`: Production
- `ConnectionStrings__DefaultConnection`: SQLite connection string
- `Storage__Path`: Upload directory
- `MediaEvents__Enabled`: Enable Kafka publishing
- `MediaEvents__BootstrapServers`: Kafka broker list
- `MediaEvents__Topic`: Media upload topic
- `MediaEvents__PublicBaseUrl`: Public API base URL for workers

Media worker configuration is in `k8s/media-worker-deployment.yaml`:
- `Kafka__BootstrapServers`: Kafka broker list
- `Kafka__Topic`: Media upload topic
- `Kafka__GroupId`: Consumer group
- `Llama__BaseUrl`: LLaMA HTTP endpoint
- `Api__BaseUrl`: Demo CMS API base URL

Frontend configuration is split between `k8s/frontend-deployment.yaml` and `k8s/canvas-frontend-deployment.yaml`:
- `BACKEND_HOST`: nginx upstream for the owning backend service.
- `CMS_HOST`: canvas frontend upstream for CMS media routes.

### Storage

The backends use PersistentVolumeClaims:
- `backend-data-pvc`: 1Gi for CMS SQLite database. The name is preserved for upgrade compatibility.
- `backend-uploads-pvc`: 10Gi for CMS uploaded files. The name is preserved for upgrade compatibility.
- `canvas-backend-data-pvc`: 1Gi for canvas SQLite database.

`deploy.sh` creates missing PVCs individually and leaves existing PVCs unchanged. This avoids Kubernetes immutable field errors when a cluster default storage class, such as Docker Desktop `hostpath`, has already been assigned to a bound claim.

Adjust sizes in `k8s/persistent-volumes.yaml` as needed.

## Troubleshooting

### Pods not starting
```bash
# Describe the pod for error details
kubectl describe pod <pod-name> -n cms-demo

# Check events
kubectl get events -n cms-demo --sort-by='.lastTimestamp'
```

### Service not accessible
```bash
# Check if ingress is configured
kubectl describe ingress cms-ingress -n cms-demo

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

### Image pull errors
Ensure images are built and loaded into your cluster:
```bash
# For minikube
minikube image ls | grep demo-cms

# For kind
docker exec -it kind-control-plane crictl images | grep demo-cms
```

### Database/storage issues
```bash
# Check PVC status
kubectl get pvc -n cms-demo

# Check PV status
kubectl get pv

# Exec into backend pod to check mounts
kubectl exec -it <cms-backend-pod-name> -n cms-demo -- ls -la /app/data /app/uploads
```

## Canvas performance simulation (RUM validation)

Opt-in client-side lag simulation for the whiteboard (`canvas-frontend`). **Not enabled** in the default [`canvas-frontend-deployment.yaml`](canvas-frontend-deployment.yaml).

### Scenario S1 — 5–6s interaction lag

Applies `no_optimistic` mode (~5.5s hub delay before UI updates).

```bash
kubectl apply -k k8s/
kubectl patch deployment canvas-frontend -n cms-demo --type=json \
  --patch-file k8s/patches/canvas-frontend-lag-env.json
```

Env: `CANVAS_LAG_SIM_MODE=no_optimistic`, `CANVAS_LAG_SIM_DELAY_MS=5500`, `CORALOGIX_ENVIRONMENT=load-test`.

### Scenario S2 — large board text-edit freeze (~1,300 shapes)

1. Seed the shared board via **canvas-load admin UI** (http://localhost:8090 → **Board prep (S2)** → **Prepare S2**, or **Seed loadgen-large (1300)** then **Large board** scenario). Pause load before seeding.

   CLI alternative (from a machine that can reach canvas API):

```bash
cd loadgen/canvas-load && npm install
npm run seed-board -- --base-url http://<canvas-frontend-host> --count 1300 --board-name loadgen-large
```

2. Apply render-stress overlay (optional fallback if natural O(n) render is insufficient):

```bash
kubectl apply -k k8s/
kubectl patch deployment canvas-frontend -n cms-demo --type=json \
  --patch-file k8s/patches/canvas-frontend-large-board-env.json
```

3. Run loadgen `large_board` scenario (canvas-load UI :8090 → Resume) or edit text manually on the seeded board.

### Coralogix validation (coralogix-server-watcher MCP)

Pre-flight: `read_rum_log_intro_docs_v1`, `read_dataprime_intro_docs_v1`, `get_datetime`.

See [docs/canvas-perf-rum-validation.md](../docs/canvas-perf-rum-validation.md) for full DataPrime queries (filter `$l.subsystemname == 'cx_rum'`, custom measurements under `$d.cx_rum.custom_measurement_context.*`).

**S1 pass:** p95 `whiteboard_interaction_commit_duration_ms` ≥ ~4950ms when `DELAY_MS=5500`; `canvas_lag_sim_active` present.

**S2 pass:** p95 `whiteboard_text_edit_commit_duration_ms` ≥ 450ms; `whiteboard_board_shape_count` ≥ 1000.

**Baseline** (sim off, small board): p95 interaction commit &lt; 500ms, text edit &lt; 100ms.

## Cleanup

Remove all resources:
```bash
# Using kustomize
kubectl delete -k k8s/

# Or delete namespace (removes everything)
kubectl delete namespace cms-demo
```

## Production Considerations

For production deployments:

1. **Use proper storage class** with backups
2. **Configure resource limits** appropriately
3. **Enable TLS/SSL** with cert-manager
4. **Use secrets** for sensitive data (connection strings, API keys)
5. **Set up monitoring** with Coralogix (see `coralogix/`)
6. **Configure horizontal pod autoscaling**
7. **Use proper image tags** (not `latest`)
8. **Set up backup strategy** for persistent volumes
9. **Configure network policies** for security
10. **Use external database** (PostgreSQL/MySQL) instead of SQLite

Example with secrets:
```bash
# Create secret for connection string
kubectl create secret generic backend-secrets \
  --from-literal=connection-string="Server=..." \
  -n cms-demo
```

Then reference in deployment:
```yaml
env:
- name: ConnectionStrings__DefaultConnection
  valueFrom:
    secretKeyRef:
      name: backend-secrets
      key: connection-string
```
