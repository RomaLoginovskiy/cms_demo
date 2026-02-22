using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using DemoCms.Infrastructure.Data;
using DemoCms.Infrastructure.Messaging;
using DemoCms.Infrastructure.Services;
using DemoCms.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OpenTelemetry.Trace;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Exporter;
using System.Diagnostics;
using System.Collections.Generic;
using System.Linq;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Configure Entity Framework
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Data Source=media.db"; // SQLite fallback

if (connectionString.Contains("Data Source="))
{
    builder.Services.AddDbContext<MediaDbContext>(options =>
        options.UseSqlite(connectionString));
}
else
{
    builder.Services.AddDbContext<MediaDbContext>(options =>
        options.UseSqlServer(connectionString));
}

// Configure storage
var storagePath = builder.Configuration.GetValue<string>("Storage:Path") ?? "uploads";
builder.Services.AddSingleton<IMediaStore>(provider => new LocalFileStore(storagePath));

// Configure media event publishing
builder.Services.Configure<MediaEventOptions>(builder.Configuration.GetSection("MediaEvents"));
builder.Services.AddSingleton<IMediaEventProducer>(provider =>
{
    var options = provider.GetRequiredService<IOptions<MediaEventOptions>>().Value;
    if (options.Enabled && !string.IsNullOrWhiteSpace(options.BootstrapServers))
    {
        return new KafkaMediaEventProducer(
            provider.GetRequiredService<IOptions<MediaEventOptions>>(),
            provider.GetRequiredService<ILogger<KafkaMediaEventProducer>>());
    }

    return new NullMediaEventProducer();
});

// Register services
builder.Services.AddScoped<IMediaService, MediaService>();

// Error generator disabled by default

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Configure OpenTelemetry
var serviceName = builder.Configuration.GetValue<string>("OpenTelemetry:ServiceName") ?? "demo-cms-api";
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
            
        // Add OTLP exporter if collector URL is configured
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
        meterProviderBuilder
            .AddAspNetCoreInstrumentation();
            
        // Add OTLP metrics export if enabled
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
        
        // Add Prometheus exporter if enabled
        var enablePrometheusExporter = builder.Configuration.GetValue<bool>("OpenTelemetry:EnablePrometheusExporter", false);
        if (enablePrometheusExporter)
        {
            meterProviderBuilder.AddPrometheusExporter();
        }
    });

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors();

// Add request headers logging middleware
app.Use(async (context, next) =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    
    // Collect all header information first
    var headersList = new List<string>();
    foreach (var header in context.Request.Headers)
    {
        headersList.Add($"  {header.Key}: {string.Join(", ", header.Value)}");
    }
    
    var correlationId = context.Request.Headers["x-correlation-id"].FirstOrDefault();
    var traceParent = context.Request.Headers["traceparent"].FirstOrDefault();
    
    // Log everything in a single, structured message to avoid interleaving
    var logMessage = $@"
=== INCOMING REQUEST ===
Method: {context.Request.Method} | Path: {context.Request.Path} | Query: {context.Request.QueryString}
Headers:
{string.Join(Environment.NewLine, headersList)}
{(correlationId != null ? $"🔗 Correlation ID: {correlationId}" : "")}
{(traceParent != null ? $"🔍 TraceParent: {traceParent}" : "")}
========================";
    
    logger.LogInformation(logMessage);
    
    await next();
});

// Add health check endpoints
app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));
app.MapGet("/ready", () => Results.Ok(new { status = "ready", timestamp = DateTime.UtcNow }));

// Add Prometheus scraping endpoint if enabled
var enablePrometheusExporter = app.Configuration.GetValue<bool>("OpenTelemetry:EnablePrometheusExporter", false);
if (enablePrometheusExporter)
{
    app.UseOpenTelemetryPrometheusScrapingEndpoint();
}

app.UseAuthorization();

app.MapControllers();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<MediaDbContext>();
    context.Database.EnsureCreated();
}

app.Run();
