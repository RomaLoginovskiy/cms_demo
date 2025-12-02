# Demo CMS Application

A modern content management system demonstrating React frontend, .NET Core backend, and full OpenTelemetry observability.

## Architecture

- **Frontend**: React 18+ with Tailwind CSS
- **Backend**: .NET 7 Core Web API with Entity Framework Core
- **Database**: SQL Server / SQLite for metadata
- **Storage**: Abstracted file storage (local/cloud)
- **Observability**: OpenTelemetry traces, metrics, and logs
- **Deployment**: Kubernetes with Helm charts

## Features

- 📸 Media upload, view, edit, delete
- 🎨 Responsive grid gallery with Tailwind CSS
- 🔍 Full observability with OpenTelemetry
- 🚀 Kubernetes-ready deployment
- 🔧 CI/CD with GitHub Actions

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
│   │   └── types/             # TypeScript types
│   └── package.json
├── helm/                      # Kubernetes deployment
├── .github/workflows/         # CI/CD
└── docker-compose.yml
```

### File Upload Validation

- **Supported formats**: JPEG, PNG, GIF, WebP
- **Maximum size**: 5MB per file
- **Client-side validation**: Type and size checks
- **Server-side validation**: Content type verification

## Deployment

### Kubernetes

```bash
# Using Helm (coming soon)
helm install demo-cms ./helm/demo-cms

# Or using kubectl
kubectl apply -f k8s/
```

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
   - Check API_URL environment variable

4. **Database issues**
   - SQLite database is created automatically
   - Check file permissions in uploads directory

### Logs

```bash
# Backend logs
cd backend && dotnet run --project DemoCms.Api

# Frontend logs
cd frontend && npm start

# Docker logs
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