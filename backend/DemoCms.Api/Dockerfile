# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app

# Copy solution file
COPY *.sln ./

# Copy project files
COPY DemoCms.Core/*.csproj ./DemoCms.Core/
COPY DemoCms.Infrastructure/*.csproj ./DemoCms.Infrastructure/
COPY DemoCms.Api/*.csproj ./DemoCms.Api/
COPY DemoCms.MediaWorker/*.csproj ./DemoCms.MediaWorker/
COPY DemoCms.MediaWorker.Tests/*.csproj ./DemoCms.MediaWorker.Tests/

# Restore dependencies
RUN dotnet restore

# Copy source code
COPY . .

# Build the application
RUN dotnet publish DemoCms.Api/DemoCms.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Create uploads directory
RUN mkdir -p /app/uploads

# Copy published application
COPY --from=build /app/publish .

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
ENV Storage__Path=/app/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Expose port
EXPOSE 8080

# Run the application
ENTRYPOINT ["dotnet", "DemoCms.Api.dll"] 