# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /app

# Copy solution file
COPY *.sln ./

# Copy project files
COPY DemoCms.Core/*.csproj ./DemoCms.Core/
COPY DemoCms.MediaWorker/*.csproj ./DemoCms.MediaWorker/
COPY DemoCms.MediaWorker.Tests/*.csproj ./DemoCms.MediaWorker.Tests/

# Restore dependencies
RUN dotnet restore DemoCms.MediaWorker/DemoCms.MediaWorker.csproj

# Copy source code
COPY . .

# Build the application
RUN dotnet publish DemoCms.MediaWorker/DemoCms.MediaWorker.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/runtime:9.0 AS runtime
WORKDIR /app

# Copy published application
COPY --from=build /app/publish .
RUN chown -R app:app /app

# Set environment variables
ENV DOTNET_ENVIRONMENT=Production

# Run the application
USER app
ENTRYPOINT ["dotnet", "DemoCms.MediaWorker.dll"]
