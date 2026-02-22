# Demo CMS Application

A modern content management system demonstrating full-stack observability with Coralogix, featuring React frontend with Real User Monitoring (RUM), .NET Core backend with OpenTelemetry, and comprehensive automated testing.

**Purpose**: This demo showcases how to instrument a modern web application with complete observability using Coralogix for traces, metrics, logs, and real user monitoring.

## Architecture

- **Frontend**: React 18+ with Tailwind CSS and Coralogix Browser RUM
- **Backend**: .NET 7 Core Web API with Entity Framework Core
- **Database**: SQL Server / SQLite for metadata
- **Storage**: Abstracted file storage (local/cloud)
- **Observability**: OpenTelemetry (OTLP) + Coralogix for traces, metrics, and logs
- **Testing**: Automated E2E tests with Puppeteer
- **Deployment**: Kubernetes with Kustomize manifests

## Features

- 📸 Media upload, view, edit, delete
- 🎨 Responsive grid gallery with Tailwind CSS
- 🔍 Full observability with OpenTelemetry and Coralogix
- 🚀 Kubernetes-ready deployment with Helm charts
- 🔧 CI/CD with GitHub Actions
- 🧪 Automated E2E testing with Puppeteer
- 📊 Real User Monitoring (RUM) with Coralogix Browser SDK

## Quick Start

### Prerequisites

- .NET 7 SDK
- Node.js 18+
- Docker and Docker Compose (for containerized deployment)

### Local Development

#### Backend

```bash
cd backend
dotnet restore
dotnet run --project DemoCms.Api
```

The API will be available at `https://localhost:7043`

#### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend will be available at `http://localhost:3000`

### Docker Compose (Recommended)

```bash
# Run the entire stack with observability
cd k8s
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the stack
docker-compose down
```

Services will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Jaeger UI**: http://localhost:16686 (traces)
- **Prometheus**: http://localhost:9090 (metrics)

## API Endpoints

| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| GET    | `/api/media`      | List media assets        |
| GET    | `/api/media/{id}` | Get asset metadata       |
| POST   | `/api/media`      | Upload images            |
| PUT    | `/api/media/{id}` | Update metadata          |
| DELETE | `/api/media/{id}` | Delete asset             |
| GET    | `/api/media/{id}/file` | Get file content    |

### Health Checks

- **Backend**: `GET /healthz` and `GET /ready`
- **Frontend**: `GET /health`

## Configuration

### Backend (appsettings.json)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=media.db"
  },
  "Storage": {
    "Path": "uploads"
  },
  "OpenTelemetry": {
    "OtlpEndpoint": "http://localhost:4317"
  }
}
```

### Frontend (.env)

```env
REACT_APP_API_URL=http://localhost:8080
```

## Observability

### Traces

The application generates distributed traces for:
- HTTP requests (ASP.NET Core)
- Database operations (Entity Framework)
- Custom application spans

View traces in Jaeger: http://localhost:16686

### Metrics

Exported metrics include:
- HTTP request duration and count
- ASP.NET Core metrics
- Custom application metrics

View metrics in Prometheus: http://localhost:9090

### Logs

Structured JSON logs with:
- Trace and span correlation IDs
- Request context
- Error details

### Coralogix Integration

This application includes full integration with Coralogix for observability:

- **Backend**: OpenTelemetry traces, metrics, and logs exported to Coralogix
- **Frontend**: Real User Monitoring (RUM) with `@coralogix/browser` SDK
- **Configuration**: Helm charts in `coralogix/` directory for easy deployment
- **Dashboards**: Pre-configured for application monitoring

To configure Coralogix:

1. Update `coralogix/values.yaml` with your API key and application details
2. Deploy the Coralogix agent to your cluster:

```bash
helm repo add coralogix https://cgx.jfrog.io/artifactory/coralogix-charts-virtual
helm upgrade --install coralogix-agent coralogix/coralogix-agent -f coralogix/values.yaml
```

## Development

### Project Structure

```
cms_demo/
├── backend/
│   ├── DemoCms.Api/           # Web API
│   ├── DemoCms.Core/          # Domain models
│   ├── DemoCms.Infrastructure/ # Data access
│   └── DemoCms.sln
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── contexts/          # React Context
│   │   ├── services/          # API services
│   │   │   └── measurements.ts # Coralogix RUM integration
│   │   ├── hooks/             # Custom React hooks
│   │   └── types/             # TypeScript types
│   └── package.json
├── automated-tests/           # Puppeteer E2E tests
│   ├── cms-puppeteer-test.js
│   └── package.json
├── k8s/                       # Kubernetes manifests
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── ingress.yaml
│   └── persistent-volumes.yaml
├── coralogix/                 # Coralogix observability config
│   ├── values.yaml
│   └── rendered_configs/
└── k8s/docker-compose.yml     # Local development stack
```

### File Upload Validation

- **Supported formats**: JPEG, PNG, GIF, WebP
- **Maximum size**: 5MB per file
- **Client-side validation**: Type and size checks
- **Server-side validation**: Content type verification

## Testing

### Automated E2E Tests

The project includes a comprehensive automated testing suite using Puppeteer for end-to-end testing.

#### Quick Start

```bash
cd automated-tests
npm install
npm test
```

#### Test Modes

- **Standard**: `npm test` - Single test run through all features
- **Headless**: `npm run test:headless` - Faster, no browser window
- **Continuous**: `npm run test:continuous` - Runs for 10 minutes, random feature testing
- **Custom Duration**: `node cms-puppeteer-test.js --continuous 1800` - 30 minutes

#### What's Tested

- ✅ Page navigation and routing
- ✅ Media gallery display and interactions
- ✅ File upload with drag & drop
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Modal interactions
- ✅ Error handling and loading states
- ✅ Console error monitoring
- ✅ Network request monitoring

#### Test Output

Tests generate screenshots in `automated-tests/screenshots/` for debugging.

For more details, see [automated-tests/README.md](automated-tests/README.md).

## Deployment

### Kubernetes

#### Prerequisites

1. Kubernetes cluster (minikube, kind, or any k8s cluster)
2. kubectl CLI tool
3. NGINX Ingress Controller

Install NGINX Ingress for minikube:

```bash
minikube addons enable ingress
```

#### Build and Load Images

```bash
# Build images
cd backend && docker build -t demo-cms-backend:latest -f Dockerfile .
cd frontend && docker build -t demo-cms-frontend:latest -f Dockerfile .

# Load into minikube
minikube image load demo-cms-backend:latest
minikube image load demo-cms-frontend:latest
```

#### Deploy

```bash
# Deploy all resources with Kustomize
kubectl apply -k k8s/

# Verify deployment
kubectl get all -n cms-demo

# Access with minikube tunnel
minikube tunnel
```

Then access:
- **Frontend**: http://localhost
- **Backend API**: http://localhost/api

For detailed instructions, troubleshooting, and production considerations, see [k8s/README.md](k8s/README.md).

### Docker Images

Build production images:

```bash
# Backend
docker build -t coralogix/demo-cms-backend:latest ./backend

# Frontend  
docker build -t coralogix/demo-cms-frontend:latest ./frontend
```

## Troubleshooting

### Common Issues

1. **Backend fails to start**
   - Check .NET 7 SDK is installed
   - Verify connection string in appsettings.json

2. **Frontend build errors**
   - Run `npm install` to update dependencies
   - Check Tailwind CSS configuration

3. **CORS errors**
   - Ensure frontend URL is configured in backend CORS policy
   - Check REACT_APP_API_URL environment variable

4. **Database issues**
   - SQLite database is created automatically
   - Check file permissions in uploads directory

5. **Observability not working**
   - Verify OpenTelemetry collector is running
   - Check OTLP endpoint configuration in appsettings.json
   - For Coralogix RUM, ensure API key is configured in frontend

### Logs

```bash
# Backend logs (local development)
cd backend && dotnet run --project DemoCms.Api

# Frontend logs (local development)
cd frontend && npm start

# Docker logs
cd k8s
docker-compose logs backend
docker-compose logs frontend
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 