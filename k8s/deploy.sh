#!/bin/bash

# Kubernetes Deployment Script for Demo CMS and Canvas
# This script builds Docker images and deploys the applications to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect cluster type
detect_cluster() {
    local context=$(kubectl config current-context)
    
    if echo "$context" | grep -q "minikube"; then
        echo "minikube"
    elif echo "$context" | grep -q "kind"; then
        echo "kind"
    elif echo "$context" | grep -q "docker-desktop\|docker-for-desktop"; then
        echo "docker-desktop"
    else
        echo "other"
    fi
}

# Generate unique image tag based on git hash or timestamp
generate_image_tag() {
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
    
    cd "$PROJECT_ROOT"
    
    # Try to get git short hash
    if git rev-parse --short HEAD &> /dev/null; then
        GIT_HASH=$(git rev-parse --short HEAD)
        # Add timestamp to ensure uniqueness even with same commit
        TIMESTAMP=$(date +%Y%m%d%H%M%S)
        IMAGE_TAG="${GIT_HASH}-${TIMESTAMP}"
    else
        # Fallback to timestamp only
        IMAGE_TAG=$(date +%Y%m%d%H%M%S)
    fi
    
    echo "$IMAGE_TAG"
}

# Build Docker images
build_images() {
    print_info "Building Docker images..."
    
    # Get script directory and project root
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
    
    # Generate unique tag
    IMAGE_TAG=$(generate_image_tag)
    export IMAGE_TAG
    print_info "Using image tag: $IMAGE_TAG"
    
    # Build CMS backend with no-cache to ensure fresh build
    print_info "Building CMS backend image..."
    docker build --no-cache -t demo-cms-backend:$IMAGE_TAG -t demo-cms-backend:latest \
        -f "$PROJECT_ROOT/backend/Dockerfile" "$PROJECT_ROOT/backend/"
    
    # Build CMS frontend with no-cache to ensure npm packages are refreshed
    print_info "Building CMS frontend image (with fresh npm install)..."
    docker build --no-cache -t demo-cms-frontend:$IMAGE_TAG -t demo-cms-frontend:latest \
        -f "$PROJECT_ROOT/frontend/Dockerfile" "$PROJECT_ROOT/frontend/"

    # Build CMS media worker
    print_info "Building CMS media worker image..."
    docker build --no-cache -t demo-cms-media-worker:$IMAGE_TAG -t demo-cms-media-worker:latest \
        -f "$PROJECT_ROOT/backend/DemoCms.MediaWorker/Dockerfile" "$PROJECT_ROOT/backend/"

    # Build canvas backend
    print_info "Building canvas backend image..."
    docker build --no-cache -t demo-canvas-backend:$IMAGE_TAG -t demo-canvas-backend:latest \
        -f "$PROJECT_ROOT/canvas-backend/Dockerfile" "$PROJECT_ROOT/canvas-backend/"

    # Build canvas frontend
    print_info "Building canvas frontend image (with fresh npm install)..."
    docker build --no-cache -t demo-canvas-frontend:$IMAGE_TAG -t demo-canvas-frontend:latest \
        -f "$PROJECT_ROOT/canvas-frontend/Dockerfile" "$PROJECT_ROOT/canvas-frontend/"

    # Build canvas load generator (Playwright-based)
    print_info "Building canvas load generator image..."
    docker build --no-cache -t demo-canvas-load:$IMAGE_TAG -t demo-canvas-load:latest \
        -f "$PROJECT_ROOT/loadgen/canvas-load/Dockerfile" "$PROJECT_ROOT/loadgen/canvas-load/"
    
    print_info "Images built successfully with tag: $IMAGE_TAG"
}

# Load images into cluster
load_images() {
    CLUSTER_TYPE=$(detect_cluster)
    
    print_info "Detected cluster type: $CLUSTER_TYPE"
    print_info "Loading images with tag: $IMAGE_TAG"
    
    if [ "$CLUSTER_TYPE" = "minikube" ]; then
        print_info "Loading images into minikube..."
        minikube image load demo-cms-backend:$IMAGE_TAG
        minikube image load demo-cms-frontend:$IMAGE_TAG
        minikube image load demo-cms-media-worker:$IMAGE_TAG
        minikube image load demo-canvas-backend:$IMAGE_TAG
        minikube image load demo-canvas-frontend:$IMAGE_TAG
        minikube image load demo-canvas-load:$IMAGE_TAG
        # Also load latest tag
        minikube image load demo-cms-backend:latest
        minikube image load demo-cms-frontend:latest
        minikube image load demo-cms-media-worker:latest
        minikube image load demo-canvas-backend:latest
        minikube image load demo-canvas-frontend:latest
        minikube image load demo-canvas-load:latest
    elif [ "$CLUSTER_TYPE" = "kind" ]; then
        print_info "Loading images into kind..."
        kind load docker-image demo-cms-backend:$IMAGE_TAG
        kind load docker-image demo-cms-frontend:$IMAGE_TAG
        kind load docker-image demo-cms-media-worker:$IMAGE_TAG
        kind load docker-image demo-canvas-backend:$IMAGE_TAG
        kind load docker-image demo-canvas-frontend:$IMAGE_TAG
        kind load docker-image demo-canvas-load:$IMAGE_TAG
        kind load docker-image demo-cms-backend:latest
        kind load docker-image demo-cms-frontend:latest
        kind load docker-image demo-cms-media-worker:latest
        kind load docker-image demo-canvas-backend:latest
        kind load docker-image demo-canvas-frontend:latest
        kind load docker-image demo-canvas-load:latest
    elif [ "$CLUSTER_TYPE" = "docker-desktop" ]; then
        print_info "Using Docker Desktop - images are already available to Kubernetes"
        print_info "Docker Desktop automatically shares images with its Kubernetes cluster"
    else
        print_warning "Cluster type not detected as minikube, kind, or docker-desktop."
        print_warning "Assuming images are available in cluster registry."
    fi
}

# Check if NGINX Ingress Controller is installed
check_ingress() {
    print_info "Checking NGINX Ingress Controller..."
    
    if ! kubectl get namespace ingress-nginx &> /dev/null; then
        print_warning "NGINX Ingress Controller not found!"
        print_info "Installing NGINX Ingress Controller..."
        
        CLUSTER_TYPE=$(detect_cluster)
        if [ "$CLUSTER_TYPE" = "minikube" ]; then
            minikube addons enable ingress
        elif [ "$CLUSTER_TYPE" = "docker-desktop" ]; then
            print_info "Installing NGINX Ingress for Docker Desktop..."
            kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml
        else
            kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml
        fi
        
        print_info "Waiting for Ingress Controller to be ready..."
        kubectl wait --namespace ingress-nginx \
          --for=condition=ready pod \
          --selector=app.kubernetes.io/component=controller \
          --timeout=120s
    else
        print_info "NGINX Ingress Controller is already installed."
    fi
}

# Deploy to Kubernetes
ensure_pvc() {
    local name=$1
    local app_label=$2
    local component_label=$3
    local storage_size=$4

    if kubectl get pvc "$name" -n cms-demo &> /dev/null; then
        print_info "PVC $name already exists; leaving immutable storage class unchanged."
        return
    fi

    print_info "Creating PVC $name..."
    kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: $name
  namespace: cms-demo
  labels:
    app: $app_label
    component: $component_label
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: $storage_size
EOF
}

ensure_pvcs() {
    ensure_pvc "backend-data-pvc" "cms-backend" "storage" "1Gi"
    ensure_pvc "backend-uploads-pvc" "cms-backend" "uploads" "10Gi"
    ensure_pvc "canvas-backend-data-pvc" "canvas-backend" "storage" "1Gi"
}

configure_rum_public_key() {
    if [ -z "${CORALOGIX_RUM_PUBLIC_KEY:-}" ]; then
        print_info "Using Coralogix RUM public key from deployment manifests."
        return
    fi

    print_info "Overriding Coralogix RUM public key from CORALOGIX_RUM_PUBLIC_KEY env variable."
    kubectl set env deployment/cms-frontend deployment/canvas-frontend \
        CORALOGIX_RUM_PUBLIC_KEY="$CORALOGIX_RUM_PUBLIC_KEY" \
        -n cms-demo > /dev/null
}

deploy() {
    print_info "Deploying Demo CMS and Canvas to Kubernetes..."
    
    # Get script directory
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

    print_info "Ensuring namespace exists..."
    kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

    print_info "Ensuring persistent volume claims exist..."
    ensure_pvcs

    print_info "Validating Kustomize manifests..."
    kubectl kustomize "$SCRIPT_DIR" > /dev/null

    print_info "Applying Kustomize bundle..."
    kubectl apply -k "$SCRIPT_DIR"

    configure_rum_public_key

    print_info "Removing legacy pre-split frontend/backend workloads..."
    kubectl delete deployment backend frontend -n cms-demo --ignore-not-found=true
    kubectl delete service backend frontend -n cms-demo --ignore-not-found=true
    
    # Update images with new tag if IMAGE_TAG is set (from build_images)
    if [ -n "$IMAGE_TAG" ]; then
        print_info "Updating deployments to use new image tag: $IMAGE_TAG"
        kubectl set image deployment/cms-backend cms-backend=demo-cms-backend:$IMAGE_TAG -n cms-demo
        kubectl set image deployment/cms-frontend cms-frontend=demo-cms-frontend:$IMAGE_TAG -n cms-demo
        kubectl set image deployment/media-worker media-worker=demo-cms-media-worker:$IMAGE_TAG -n cms-demo
        kubectl set image deployment/canvas-backend canvas-backend=demo-canvas-backend:$IMAGE_TAG -n cms-demo
        kubectl set image deployment/canvas-frontend canvas-frontend=demo-canvas-frontend:$IMAGE_TAG -n cms-demo
        kubectl delete deployment canvas-load -n cms-demo --ignore-not-found=true
        kubectl set image statefulset/canvas-load canvas-load=demo-canvas-load:$IMAGE_TAG -n cms-demo
        kubectl set env deployment/cms-frontend CORALOGIX_APP_VERSION="$IMAGE_TAG" -n cms-demo
        kubectl set env deployment/canvas-frontend CORALOGIX_APP_VERSION="$IMAGE_TAG" -n cms-demo
        
        # Force rollout to ensure pods pick up the new images
        print_info "Forcing rollout restart to apply new images..."
        kubectl rollout restart deployment/cms-backend -n cms-demo
        kubectl rollout restart deployment/cms-frontend -n cms-demo
        kubectl rollout restart deployment/media-worker -n cms-demo
        kubectl rollout restart deployment/canvas-backend -n cms-demo
        kubectl rollout restart deployment/canvas-frontend -n cms-demo
        kubectl rollout restart statefulset/canvas-load -n cms-demo
    elif [ "$FORCE_REFRESH" = true ]; then
        # Force rollout restart without rebuilding (uses existing latest image)
        print_info "Forcing rollout restart with existing images..."
        kubectl rollout restart deployment/cms-backend -n cms-demo
        kubectl rollout restart deployment/cms-frontend -n cms-demo
        kubectl rollout restart deployment/media-worker -n cms-demo
        kubectl rollout restart deployment/canvas-backend -n cms-demo
        kubectl rollout restart deployment/canvas-frontend -n cms-demo
        kubectl rollout restart statefulset/canvas-load -n cms-demo
    fi
    
    print_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=300s \
        deployment/cms-backend deployment/cms-frontend deployment/media-worker deployment/canvas-backend deployment/canvas-frontend \
        -n cms-demo
    print_info "Waiting for canvas-load StatefulSet (3 pods, sequential rollout — often 2-4 min; 'Waiting for 1 pods' is normal)..."
    kubectl rollout status statefulset/canvas-load -n cms-demo --timeout=300s
    
    print_info "Demo CMS and Canvas deployment completed successfully!"
}

# Returns 0 when URL responds with HTTP 2xx/3xx within timeout
probe_http() {
    local url=$1
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "$url" 2>/dev/null || echo "000")
    [[ "$code" =~ ^[23][0-9]{2}$ ]]
}

show_port_forward_hints() {
    local need_ingress=false
    local need_loadgen=false

    if ! probe_http "http://127.0.0.1/"; then
        need_ingress=true
    fi
    if ! probe_http "http://127.0.0.1:8090/healthz"; then
        need_loadgen=true
    fi

    if [ "$need_ingress" = false ] && [ "$need_loadgen" = false ]; then
        return
    fi

    echo ""
    print_warning "LoadBalancer not reachable on localhost (common on Docker Desktop after restart). Run in separate terminals:"
    if [ "$need_ingress" = true ]; then
        echo "  kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 80:80"
    fi
    if [ "$need_loadgen" = true ]; then
        echo "  kubectl port-forward -n cms-demo svc/canvas-load 8090:8090"
    fi
    echo ""
    print_info "Or run both at once:  $0 port-forward"
}

port_forward() {
    print_info "Starting port-forwards (Ctrl+C to stop)..."
    kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 80:80 &
    local pf_ingress=$!
    kubectl port-forward -n cms-demo svc/canvas-load 8090:8090 &
    local pf_loadgen=$!
    trap 'kill '"$pf_ingress $pf_loadgen"' 2>/dev/null; exit' INT TERM
    print_info "Canvas/CMS: http://localhost  |  Loadgen: http://localhost:8090"
    wait
}

# Display access information
show_access_info() {
    print_info "==================================="
    print_info "Demo CMS and Canvas Deployment Complete!"
    print_info "==================================="
    
    CLUSTER_TYPE=$(detect_cluster)
    
    echo ""
    print_info "Application URLs:"
    
    if [ "$CLUSTER_TYPE" = "minikube" ]; then
        print_info "Run 'minikube tunnel' in a separate terminal and access:"
        echo -e "  Canvas:      ${GREEN}http://localhost${NC}"
        echo -e "  CMS UI:      ${GREEN}http://localhost/cms${NC}"
        echo -e "  Board API:   ${GREEN}http://localhost/api/boards${NC}"
        echo -e "  Hub:         ${GREEN}ws://localhost/hubs/board${NC}"
        echo -e "  CMS Media:   ${GREEN}http://localhost/api/media${NC}"
        echo -e "  Loadgen UI:  ${GREEN}http://localhost:8090${NC}"
    elif [ "$CLUSTER_TYPE" = "docker-desktop" ]; then
        echo -e "  Canvas:      ${GREEN}http://localhost${NC}"
        echo -e "  CMS UI:      ${GREEN}http://localhost/cms${NC}"
        echo -e "  Board API:   ${GREEN}http://localhost/api/boards${NC}"
        echo -e "  Hub:         ${GREEN}ws://localhost/hubs/board${NC}"
        echo -e "  CMS Media:   ${GREEN}http://localhost/api/media${NC}"
        echo -e "  Loadgen UI:  ${GREEN}http://localhost:8090${NC}"
        show_port_forward_hints
    else
        echo -e "  Canvas:      ${GREEN}http://localhost${NC}"
        echo -e "  CMS UI:      ${GREEN}http://localhost/cms${NC}"
        echo -e "  Board API:   ${GREEN}http://localhost/api/boards${NC}"
        echo -e "  Hub:         ${GREEN}ws://localhost/hubs/board${NC}"
        echo -e "  CMS Media:   ${GREEN}http://localhost/api/media${NC}"
        echo ""
        show_port_forward_hints
    fi
    
    echo ""
    print_info "Useful commands:"
    echo "  View pods:           kubectl get pods -n cms-demo"
    echo "  View services:       kubectl get svc -n cms-demo"
    echo "  View ingress:        kubectl get ingress -n cms-demo"
    echo "  CMS backend logs:    kubectl logs -n cms-demo -l app=cms-backend -f"
    echo "  CMS frontend logs:   kubectl logs -n cms-demo -l app=cms-frontend -f"
    echo "  Media worker logs:   kubectl logs -n cms-demo -l app=media-worker -f"
    echo "  Canvas API logs:     kubectl logs -n cms-demo -l app=canvas-backend -f"
    echo "  Canvas UI logs:      kubectl logs -n cms-demo -l app=canvas-frontend -f"
    echo "  Describe pod:        kubectl describe pod -n cms-demo <pod-name>"
    echo "  Restart deployment:  kubectl rollout restart deployment/<name> -n cms-demo"
    echo "  Delete app:          kubectl delete namespace cms-demo"
}

# Main execution
main() {
    # Check for subcommands
    COMMAND=${1:-deploy}
    
    case $COMMAND in
        deploy)
            [ $# -gt 0 ] && shift
            ;;
        cleanup|delete)
            cleanup
            exit 0
            ;;
        status)
            status
            exit 0
            ;;
        logs)
            shift
            logs "$@"
            exit 0
            ;;
        port-forward|pf)
            port_forward
            exit 0
            ;;
        help|--help|-h)
            echo "Demo CMS and Canvas Deployment Script"
            echo ""
            echo "Usage: $0 [COMMAND] [OPTIONS]"
            echo ""
            echo "Commands:"
            echo "  deploy       Deploy the application (default)"
            echo "  cleanup      Delete all resources"
            echo "  status       Show deployment status"
            echo "  logs [app]   Show logs (cms-backend|cms-frontend|media-worker|canvas-backend|canvas-frontend)"
            echo "  port-forward Start localhost port-forwards for ingress (:80) and loadgen (:8090)"
            echo "  help         Show this help message"
            echo ""
            echo "Deploy Options:"
            echo "  --skip-build      Skip building Docker images"
            echo "  --no-images       Don't load images into cluster"
            echo "  --force-refresh   Force rollout restart without rebuilding"
            echo ""
            echo "Note: By default, images are rebuilt with --no-cache to ensure"
            echo "      npm packages and code changes are always picked up."
            exit 0
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac

    print_info "Starting Demo CMS and Canvas deployment..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop first."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker Desktop."
        print_info "On macOS: Open Docker Desktop application from Applications folder"
        exit 1
    fi
    
    # Parse arguments
    LOAD_IMAGES=true
    SKIP_BUILD=false
    FORCE_REFRESH=false
    
    for arg in "$@"; do
        case $arg in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --no-images)
                LOAD_IMAGES=false
                shift
                ;;
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
        esac
    done
    
    # Build images unless skipped
    if [ "$SKIP_BUILD" = false ]; then
        build_images
        if [ "$LOAD_IMAGES" = true ]; then
            load_images
        else
            print_warning "Skipping image load into cluster (--no-images)."
        fi
    fi
    
    # Export FORCE_REFRESH for use in deploy function
    export FORCE_REFRESH
    
    # Check and install ingress controller if needed
    check_ingress
    
    # Deploy application
    deploy
    
    # Show access information
    show_access_info
}

# Cleanup function
cleanup() {
    print_warning "Cleaning up Demo CMS and Canvas deployment..."
    
    read -p "Are you sure you want to delete all resources? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        print_info "Deleting namespace cms-demo..."
        kubectl delete namespace cms-demo
        print_info "Cleanup completed!"
    else
        print_info "Cleanup cancelled."
    fi
}

# Show status
status() {
    print_info "Demo CMS and Canvas Status:"
    echo ""
    
    print_info "Deployments:"
    kubectl get deployments -n cms-demo
    echo ""
    
    print_info "Pods:"
    kubectl get pods -n cms-demo -o wide
    echo ""
    
    print_info "Services:"
    kubectl get svc -n cms-demo
    echo ""
    
    print_info "Ingress:"
    kubectl get ingress -n cms-demo
    echo ""
    
    print_info "PersistentVolumeClaims:"
    kubectl get pvc -n cms-demo
}

# Show logs
logs() {
    component=${1:-canvas-backend}
    
    print_info "Showing logs for $component..."
    kubectl logs -n cms-demo -l app=$component -f --tail=100
}

# Run main function
main "$@"
