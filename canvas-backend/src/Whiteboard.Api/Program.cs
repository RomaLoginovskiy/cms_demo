using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Whiteboard.Api;
using Whiteboard.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origin = builder.Configuration["Cors:Origin"] ?? "http://localhost:3000";
        policy.WithOrigins(origin).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    });
});

var serviceName = builder.Configuration.GetValue<string>("OpenTelemetry:ServiceName") ?? "demo-canvas-api";
var serviceVersion = builder.Configuration.GetValue<string>("OpenTelemetry:ServiceVersion") ?? "1.0.0";

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(serviceName, serviceVersion)
        .AddAttributes(new Dictionary<string, object>
        {
            ["environment"] = builder.Environment.EnvironmentName,
            ["service.instance.id"] = Environment.MachineName,
            ["deployment.environment"] = builder.Environment.EnvironmentName
        }))
    .WithTracing(tracerProviderBuilder =>
    {
        tracerProviderBuilder
            .AddSource(serviceName)
            .SetSampler(new AlwaysOnSampler())
            .AddAspNetCoreInstrumentation(options =>
            {
                options.EnrichWithHttpRequest = (activity, request) =>
                {
                    activity.SetTag("http.request.method", request.Method);
                    activity.SetTag("http.request.scheme", request.Scheme);
                };
                options.EnrichWithHttpResponse = (activity, response) =>
                {
                    activity.SetTag("http.response.status_code", response.StatusCode);
                };
                options.RecordException = true;
            })
            .AddEntityFrameworkCoreInstrumentation(options =>
            {
                options.SetDbStatementForText = true;
                options.SetDbStatementForStoredProcedure = true;
                options.EnrichWithIDbCommand = (activity, command) =>
                {
                    activity.SetTag("db.operation", command.CommandType.ToString());
                };
            });

        var otlpEndpoint = builder.Configuration.GetValue<string>("OpenTelemetry:OtlpEndpoint");
        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            var fullEndpoint = otlpEndpoint.EndsWith("/v1/traces") ? otlpEndpoint : $"{otlpEndpoint}/v1/traces";
            tracerProviderBuilder.AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri(fullEndpoint);
                options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
            });
        }
    })
    .WithMetrics(meterProviderBuilder =>
    {
        meterProviderBuilder.AddAspNetCoreInstrumentation();

        var enableOtlpExporter = builder.Configuration.GetValue<bool>("OpenTelemetry:EnableOtlpExporter", true);
        var otlpEndpoint = builder.Configuration.GetValue<string>("OpenTelemetry:OtlpEndpoint");
        if (enableOtlpExporter && !string.IsNullOrEmpty(otlpEndpoint))
        {
            var fullMetricsEndpoint = otlpEndpoint.EndsWith("/v1/metrics") ? otlpEndpoint : $"{otlpEndpoint}/v1/metrics";
            meterProviderBuilder.AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri(fullMetricsEndpoint);
                options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
            });
        }
    });

builder.Services.AddSingleton<IBoardPresenceStore, BoardPresenceStore>();
builder.Services.AddWhiteboardInfrastructure(builder.Configuration);
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

var app = builder.Build();

app.UseCors();

app.Use(async (context, next) =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    var traceParent = context.Request.Headers["traceparent"].FirstOrDefault();
    logger.LogInformation(
        "Incoming request {Method} {Path}{QueryString}. TraceParent={TraceParent}",
        context.Request.Method,
        context.Request.Path,
        context.Request.QueryString,
        traceParent);
    await next();
});

app.UseRumDemo();
app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", timestamp = DateTimeOffset.UtcNow }));
app.MapGet("/ready", () => Results.Ok(new { status = "ready", timestamp = DateTimeOffset.UtcNow }));
app.MapBoardEndpoints();
app.MapHub<BoardHub>("/hubs/board");

await app.RunAsync();

public partial class Program;
