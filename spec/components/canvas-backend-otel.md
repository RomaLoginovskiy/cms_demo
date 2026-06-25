# Canvas Backend OpenTelemetry — Component Contract

Last updated: 2026-06-01

## Purpose

Export whiteboard API and SignalR server spans to the same OTLP collector path as `demo-cms-api`.

**Owner**: `canvas-backend/src/Whiteboard.Api/Program.cs`

## Configuration

| Setting | Local default | K8s |
|---------|---------------|-----|
| `OpenTelemetry:ServiceName` | `demo-canvas-api` | `OpenTelemetry__ServiceName` |
| `OpenTelemetry:OtlpEndpoint` | `http://otel-collector:4318` | `http://$(NODE):4318` |
| Export path | `{endpoint}/v1/traces` | HttpProtobuf |

## Instrumentation

- ASP.NET Core (HTTP)
- Entity Framework Core (SQLite)

## Related

- [ADR-013](../adr/ADR-013-cms-frontend-rum-span-export.md)
