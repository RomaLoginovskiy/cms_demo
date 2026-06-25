#!/bin/bash

# CMS Demo - Automated Testing Runner
# This script helps you run the automated tests with various options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16+ to continue."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_error "Node.js version 16+ is required. Current version: $(node -v)"
        exit 1
    fi
    
    print_success "Node.js $(node -v) is installed"
}

# Check if CMS application is running
check_cms_running() {
    print_status "Checking if CMS application is running..."
    
    local deployment_type="unknown"
    
    # Check for Kubernetes deployment
    if kubectl get pods -n cms-demo &> /dev/null; then
        print_success "Kubernetes deployment detected"
        deployment_type="kubernetes"
        
        # Check if pods are running
        local running_pods=$(kubectl get pods -n cms-demo --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
        if [ "$running_pods" -gt 0 ]; then
            print_success "Found $running_pods running pods in cms-demo namespace"
        else
            print_warning "No running pods found in cms-demo namespace"
            print_warning "Please deploy the application first: ./k8s/deploy.sh"
        fi
        
        # Check ingress
        if kubectl get ingress cms-ingress -n cms-demo &> /dev/null; then
            print_success "Ingress is configured"
        fi
    fi
    
    # Check if application is accessible (works for both Docker and K8s)
    if curl -s http://localhost/cms > /dev/null 2>&1; then
        print_success "CMS frontend is accessible at http://localhost/cms"
    else
        print_warning "CMS frontend doesn't seem to be accessible at http://localhost/cms"
        
        if [ "$deployment_type" = "unknown" ]; then
            # Check Docker Compose
            if docker-compose ps 2>/dev/null | grep -q "Up"; then
                print_success "Docker Compose deployment detected"
                print_warning "Frontend might be on port 3000. Set CMS_BASE_URL=http://localhost:3000"
            else
                print_warning "No running deployment found"
                echo "Please start the CMS application:"
                echo "  For Kubernetes: ./k8s/deploy.sh"
                echo "  For Docker Compose: docker-compose up"
            fi
        fi
    fi
    
    # Check backend API
    if curl -s http://localhost/api/media > /dev/null 2>&1; then
        print_success "Backend API is accessible at http://localhost/api"
    else
        print_warning "Backend API doesn't seem to be accessible at http://localhost/api"
        if [ "$deployment_type" = "unknown" ]; then
            print_warning "If using Docker Compose, set CMS_API_URL=http://localhost:8080/api"
        fi
    fi
    
    echo ""
    print_status "Configuration:"
    echo "  Base URL: ${CMS_BASE_URL:-http://localhost/cms (default)}"
    echo "  API URL:  ${CMS_API_URL:-http://localhost/api (default)}"
    echo ""
}

# Install dependencies
install_deps() {
    print_status "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Show usage
show_usage() {
    echo "CMS Demo - Automated Testing Runner"
    echo ""
    echo "Usage: ./run-tests.sh [option]"
    echo ""
    echo "Options:"
    echo "  setup              Install dependencies and check environment"
    echo "  test               Run all tests once (with browser visible)"
    echo "  test-headless      Run all tests in headless mode"
    echo "  test-continuous    Run continuous testing for 10 minutes"
    echo "  test-quick         Run quick test cycle (3 minutes)"
    echo "  test-long          Run extended testing (30 minutes)"
    echo "  check              Check if CMS application is running"
    echo "  clean              Clean up generated files"
    echo "  help               Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  CMS_BASE_URL       Base URL for the frontend (default: http://localhost/cms)"
    echo "  CMS_API_URL        API URL for the backend (default: http://localhost/api)"
    echo "  HEADLESS           Run tests in headless mode (default: false)"
    echo ""
    echo "Examples:"
    echo "  ./run-tests.sh setup                              # First time setup"
    echo "  ./run-tests.sh test                               # Standard test (Kubernetes)"
    echo "  CMS_BASE_URL=http://localhost:3000 \\"
    echo "    CMS_API_URL=http://localhost:8080/api \\"
    echo "    ./run-tests.sh test                             # Docker Compose"
    echo "  HEADLESS=true ./run-tests.sh test                 # Headless mode"
    echo "  ./run-tests.sh test-continuous                    # Long running tests"
    echo ""
    echo "For Kubernetes deployment:"
    echo "  Uses http://localhost/cms (via ingress)"
    echo ""
    echo "For Docker Compose deployment:"
    echo "  Set CMS_BASE_URL=http://localhost:3000"
    echo "  Set CMS_API_URL=http://localhost:8080/api"
}

# Clean up generated files
clean_up() {
    print_status "Cleaning up generated files..."
    rm -rf screenshots/
    rm -rf test-data/
    rm -rf node_modules/.cache/
    print_success "Cleanup completed"
}

# Main script logic
case "${1:-help}" in
    "setup")
        print_status "Setting up automated testing environment..."
        check_node
        install_deps
        check_cms_running
        print_success "Setup completed! You can now run tests."
        ;;
    "test")
        check_node
        check_cms_running
        print_status "Running standard test suite..."
        print_status "Base URL: ${CMS_BASE_URL:-http://localhost/cms}"
        print_status "API URL: ${CMS_API_URL:-http://localhost:8080/api}"
        node "$(dirname "$0")/cms-puppeteer-test.js"
        ;;
    "test-headless")
        check_node
        check_cms_running
        print_status "Running tests in headless mode..."
        HEADLESS=true node "$(dirname "$0")/cms-puppeteer-test.js" --headless
        ;;
    "test-continuous")
        check_node
        check_cms_running
        print_status "Running continuous tests for 10 minutes..."
        node "$(dirname "$0")/cms-puppeteer-test.js" --continuous 600
        ;;
    "test-quick")
        check_node
        check_cms_running
        print_status "Running quick test cycle (3 minutes)..."
        node "$(dirname "$0")/cms-puppeteer-test.js" --continuous 180
        ;;
    "test-long")
        check_node
        check_cms_running
        print_status "Running extended testing (30 minutes)..."
        node "$(dirname "$0")/cms-puppeteer-test.js" --continuous 1800
        ;;
    "check")
        check_node
        check_cms_running
        ;;
    "clean")
        clean_up
        ;;
    "help"|*)
        show_usage
        ;;
esac