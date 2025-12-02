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
docker build -t demo-cms-backend:latest -f DemoCms.Api/Dockerfile .
```

### Frontend
```bash
cd frontend
docker build -t demo-cms-frontend:latest -f Dockerfile .
```

### For minikube (load images into minikube)
```bash
minikube image load demo-cms-backend:latest
minikube image load demo-cms-frontend:latest
```

### For kind (load images into kind)
```bash
kind load docker-image demo-cms-backend:latest
kind load docker-image demo-cms-frontend:latest
```

## Deployment

### Option 1: Deploy all resources at once
```bash
kubectl apply -k k8s/
```

### Option 2: Deploy resources individually
```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create persistent volumes
kubectl apply -f k8s/persistent-volumes.yaml

# 3. Deploy backend
kubectl apply -f k8s/backend-deployment.yaml

# 4. Deploy frontend
kubectl apply -f k8s/frontend-deployment.yaml

# 5. Deploy ingress
kubectl apply -f k8s/ingress.yaml
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

Frontend configuration is in `k8s/frontend-deployment.yaml`:
- `REACT_APP_API_URL`: API base URL (uses ingress routing)

### Storage

The backend uses two PersistentVolumeClaims:
- `backend-data-pvc`: 1Gi for SQLite database
- `backend-uploads-pvc`: 10Gi for uploaded files

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
kubectl exec -it <backend-pod-name> -n cms-demo -- ls -la /app/data /app/uploads
```

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
5. **Set up monitoring** with Prometheus and Grafana
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
