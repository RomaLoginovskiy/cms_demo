#!/bin/bash

# Kubernetes Deployment Script for Demo CMS
# This script builds Docker images and deploys the application to Kubernetes

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
    
    # Build backend with no-cache to ensure fresh build
    print_info "Building backend image..."
    docker build --no-cache -t demo-cms-backend:$IMAGE_TAG -t demo-cms-backend:latest \
        -f "$PROJECT_ROOT/backend/DemoCms.Api/Dockerfile" "$PROJECT_ROOT/backend/"
    
    # Build frontend with no-cache to ensure npm packages are refreshed
    print_info "Building frontend image (with fresh npm install)..."
    docker build --no-cache -t demo-cms-frontend:$IMAGE_TAG -t demo-cms-frontend:latest \
        -f "$PROJECT_ROOT/frontend/Dockerfile" "$PROJECT_ROOT/frontend/"
    
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
        # Also load latest tag
        minikube image load demo-cms-backend:latest
        minikube image load demo-cms-frontend:latest
    elif [ "$CLUSTER_TYPE" = "kind" ]; then
        print_info "Loading images into kind..."
        kind load docker-image demo-cms-backend:$IMAGE_TAG
        kind load docker-image demo-cms-frontend:$IMAGE_TAG
        kind load docker-image demo-cms-backend:latest
        kind load docker-image demo-cms-frontend:latest
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

# Create OpenTelemetry Collector ConfigMap
create_otel_config() {
    print_info "Creating OpenTelemetry Collector ConfigMap..."
    
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
    
    # Check if otel-config.yaml exists
    if [ -f "$PROJECT_ROOT/otel-config.yaml" ]; then
        # Create or update ConfigMap from file
        kubectl create configmap otel-collector-config \
            --from-file=otel-collector-config.yaml="$PROJECT_ROOT/otel-config.yaml" \
            -n cms-demo \
            --dry-run=client -o yaml | kubectl apply -f -
        print_info "OpenTelemetry Collector ConfigMap created/updated"
    else
        print_warning "otel-config.yaml not found, skipping ConfigMap creation"
    fi
}

# Remove logs-generator namespace if it exists
remove_logs_generator() {
    if kubectl get namespace logs-generator &> /dev/null; then
        print_warning "Removing logs-generator namespace to stop synthetic logs..."
        kubectl delete namespace logs-generator --ignore-not-found
    fi
}

# Deploy to Kubernetes
deploy() {
    print_info "Deploying to Kubernetes..."
    
    # Get script directory
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # Create namespace first
    print_info "Creating namespace..."
    kubectl apply -f "$SCRIPT_DIR/namespace.yaml"
    
    # Apply persistent volumes
    print_info "Creating persistent volumes..."
    kubectl apply -f "$SCRIPT_DIR/persistent-volumes.yaml"
    
    # Deploy Kafka
    print_info "Deploying Kafka..."
    kubectl apply -f "$SCRIPT_DIR/kafka-deployment.yaml"
    
    # Apply deployments
    print_info "Deploying backend..."
    kubectl apply -f "$SCRIPT_DIR/backend-deployment.yaml"
    
    print_info "Deploying frontend..."
    kubectl apply -f "$SCRIPT_DIR/frontend-deployment.yaml"
    
    # Apply OTEL agent service
    print_info "Creating OTEL agent service..."
    kubectl apply -f "$SCRIPT_DIR/otel-agent-service.yaml"
    
    # Apply ingress
    print_info "Creating ingress..."
    kubectl apply -f "$SCRIPT_DIR/ingress.yaml"
    
    # Update images with new tag if IMAGE_TAG is set (from build_images)
    if [ -n "$IMAGE_TAG" ]; then
        print_info "Updating deployments to use new image tag: $IMAGE_TAG"
        kubectl set image deployment/backend backend=demo-cms-backend:$IMAGE_TAG -n cms-demo
        kubectl set image deployment/frontend frontend=demo-cms-frontend:$IMAGE_TAG -n cms-demo
        
        # Force rollout to ensure pods pick up the new images
        print_info "Forcing rollout restart to apply new images..."
        kubectl rollout restart deployment/backend -n cms-demo
        kubectl rollout restart deployment/frontend -n cms-demo
    elif [ "$FORCE_REFRESH" = true ]; then
        # Force rollout restart without rebuilding (uses existing latest image)
        print_info "Forcing rollout restart with existing images..."
        kubectl rollout restart deployment/backend -n cms-demo
        kubectl rollout restart deployment/frontend -n cms-demo
    fi
    
    print_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=300s \
        deployment/backend deployment/frontend \
        -n cms-demo
    
    print_info "Deployment completed successfully!"
}

# Display access information
show_access_info() {
    print_info "==================================="
    print_info "Deployment Complete!"
    print_info "==================================="
    
    CLUSTER_TYPE=$(detect_cluster)
    
    echo ""
    print_info "Application URLs:"
    
    if [ "$CLUSTER_TYPE" = "minikube" ]; then
        MINIKUBE_IP=$(minikube ip)
        echo -e "  Frontend: ${GREEN}http://$MINIKUBE_IP${NC}"
        echo -e "  Backend API: ${GREEN}http://$MINIKUBE_IP/api${NC}"
        echo ""
        print_info "Or run 'minikube tunnel' in a separate terminal and access:"
        echo -e "  Frontend: ${GREEN}http://localhost${NC}"
        echo -e "  Backend API: ${GREEN}http://localhost/api${NC}"
    elif [ "$CLUSTER_TYPE" = "docker-desktop" ]; then
        echo -e "  Frontend: ${GREEN}http://localhost${NC}"
        echo -e "  Backend API: ${GREEN}http://localhost/api${NC}"
        echo ""
        print_info "Docker Desktop Kubernetes should automatically handle ingress on localhost"
        print_warning "If not accessible, you may need to port-forward:"
        echo "  kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 80:80"
    else
        echo -e "  Frontend: ${GREEN}http://localhost${NC}"
        echo -e "  Backend API: ${GREEN}http://localhost/api${NC}"
        echo ""
        print_warning "You may need to run port forwarding:"
        echo "  kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 80:80"
    fi
    
    echo ""
    print_info "Useful commands:"
    echo "  View pods:           kubectl get pods -n cms-demo"
    echo "  View services:       kubectl get svc -n cms-demo"
    echo "  View ingress:        kubectl get ingress -n cms-demo"
    echo "  Backend logs:        kubectl logs -n cms-demo -l app=backend -f"
    echo "  Frontend logs:       kubectl logs -n cms-demo -l app=frontend -f"
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
        help|--help|-h)
            echo "Demo CMS Deployment Script"
            echo ""
            echo "Usage: $0 [COMMAND] [OPTIONS]"
            echo ""
            echo "Commands:"
            echo "  deploy       Deploy the application (default)"
            echo "  cleanup      Delete all resources"
            echo "  status       Show deployment status"
            echo "  logs [app]   Show logs (backend|frontend)"
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

    print_info "Starting Demo CMS deployment..."
    
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
    BUILD_IMAGES=true
    SKIP_BUILD=false
    FORCE_REFRESH=false
    
    for arg in "$@"; do
        case $arg in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --no-images)
                BUILD_IMAGES=false
                shift
                ;;
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
        esac
    done
    
    # Build images unless skipped
    if [ "$SKIP_BUILD" = false ] && [ "$BUILD_IMAGES" = true ]; then
        build_images
        load_images
    fi
    
    # Export FORCE_REFRESH for use in deploy function
    export FORCE_REFRESH
    
    # Check and install ingress controller if needed
    check_ingress
    
    # Ensure logs-generator is removed
    remove_logs_generator
    
    # Deploy application
    deploy
    
    # Show access information
    show_access_info
}

# Cleanup function
cleanup() {
    print_warning "Cleaning up Demo CMS deployment..."
    
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
    print_info "Demo CMS Status:"
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
    component=${1:-backend}
    
    print_info "Showing logs for $component..."
    kubectl logs -n cms-demo -l app=$component -f --tail=100
}

# Run main function
main "$@"
