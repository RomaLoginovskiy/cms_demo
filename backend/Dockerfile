# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy CMS solution and project files
COPY DemoCms.sln ./
COPY DemoCms.Core/*.csproj ./DemoCms.Core/
COPY DemoCms.Infrastructure/*.csproj ./DemoCms.Infrastructure/
COPY DemoCms.Api/*.csproj ./DemoCms.Api/
COPY DemoCms.MediaWorker/*.csproj ./DemoCms.MediaWorker/
COPY DemoCms.MediaWorker.Tests/*.csproj ./DemoCms.MediaWorker.Tests/

# Restore dependencies
RUN dotnet restore DemoCms.sln

# Copy source code
COPY . .

# Build the CMS API
RUN dotnet publish DemoCms.Api/DemoCms.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Create storage directories and install curl for Docker health checks
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/uploads \
    && chown -R app:app /app

# Copy published application
COPY --from=build /app/publish .

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
ENV ConnectionStrings__DefaultConnection="Data Source=/app/data/media.db"
ENV Storage__Path=/app/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Expose port
EXPOSE 8080

# Run the application
USER app
ENTRYPOINT ["dotnet", "DemoCms.Api.dll"]
