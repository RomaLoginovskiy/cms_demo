# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy whiteboard solution and project files
COPY Whiteboard.sln ./
COPY src/Whiteboard.Domain/*.csproj ./src/Whiteboard.Domain/
COPY src/Whiteboard.Infrastructure/*.csproj ./src/Whiteboard.Infrastructure/
COPY src/Whiteboard.Api/*.csproj ./src/Whiteboard.Api/
COPY tests/Whiteboard.Tests/*.csproj ./tests/Whiteboard.Tests/

# Restore dependencies
RUN dotnet restore Whiteboard.sln

# Copy source code
COPY . .

# Build the application
RUN dotnet publish src/Whiteboard.Api/Whiteboard.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Create data directory and install curl for Docker health checks
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data \
    && chown -R app:app /app

# Copy published application
COPY --from=build /app/publish .

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
ENV ConnectionStrings__Sqlite="Data Source=/app/data/whiteboard.db"
ENV Cors__Origin=http://localhost:3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Expose port
EXPOSE 8080

# Run the application
USER app
ENTRYPOINT ["dotnet", "Whiteboard.Api.dll"]
