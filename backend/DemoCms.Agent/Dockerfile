# Build context: backend/ (see infra/local/scripts/images.sh and .github/workflows/images.yml)
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY DemoCms.Core/*.csproj ./DemoCms.Core/
COPY DemoCms.Agent/*.csproj ./DemoCms.Agent/
RUN dotnet restore DemoCms.Agent/DemoCms.Agent.csproj

COPY DemoCms.Core/ ./DemoCms.Core/
COPY DemoCms.Agent/ ./DemoCms.Agent/
RUN dotnet publish DemoCms.Agent/DemoCms.Agent.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Non-root (UID 1654); listens on 8080 (ASPNETCORE_HTTP_PORTS default of the aspnet image).
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "DemoCms.Agent.dll"]
