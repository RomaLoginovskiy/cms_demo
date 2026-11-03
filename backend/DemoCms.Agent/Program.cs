using System.Threading.RateLimiting;
using DemoCms.Agent;
using DemoCms.Agent.Chat;
using DemoCms.Agent.Cms;
using DemoCms.Agent.Telemetry;
using DemoCms.Agent.Tools;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using OpenTelemetry.Exporter;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<CmsOptions>(builder.Configuration.GetSection("Cms"));
builder.Services.Configure<LlmOptions>(builder.Configuration.GetSection("Llm"));
builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection("Agent"));
builder.Services.Configure<AgentTelemetryOptions>(builder.Configuration.GetSection("OpenTelemetry"));
var agentOptions = builder.Configuration.GetSection("Agent").Get<AgentOptions>() ?? new AgentOptions();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PeriodResolver>();
builder.Services.AddSingleton<LlmHealth>();
builder.Services.AddTransient<MediaToolset>();
builder.Services.AddTransient<AgentChatService>();
builder.Services.AddProblemDetails();

builder.Services.AddHttpClient<CmsApiClient>((sp, http) =>
    {
        http.BaseAddress = new Uri(sp.GetRequiredService<IOptions<CmsOptions>>().Value.BaseUrl);
    })
    .AddStandardResilienceHandler(resilience =>
    {
        var cms = builder.Configuration.GetSection("Cms").Get<CmsOptions>() ?? new CmsOptions();
        resilience.Retry.MaxRetryAttempts = 1;
        resilience.AttemptTimeout.Timeout = TimeSpan.FromSeconds(cms.TimeoutSeconds);
        resilience.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(cms.TimeoutSeconds * 2 + 2);
        resilience.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(Math.Max(30, cms.TimeoutSeconds * 2));
    });
builder.Services.AddHttpClient(LlmHealth.HttpClientName);

// Model client for vLLM's OpenAI-compatible API, wrapped in the tool loop and GenAI telemetry.
var captureContent = builder.Configuration.GetValue("OpenTelemetry:CaptureMessageContent", false);
builder.Services.AddSingleton<IChatClient>(sp =>
{
    var llm = sp.GetRequiredService<IOptions<LlmOptions>>().Value;
    return AgentChatPipeline.Build(
        LlmClientFactory.Create(llm),
        sp.GetRequiredService<ILoggerFactory>(),
        agentOptions,
        captureContent,
        new Uri(llm.BaseUrl));
});

// Admission: per-client fixed window plus a global concurrency limit with a short queue.
builder.Services.AddSingleton(new ConcurrencyLimiter(new ConcurrencyLimiterOptions
{
    PermitLimit = agentOptions.MaxConcurrentChats,
    QueueLimit = agentOptions.QueueLimit,
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst
}));
builder.Services.AddRateLimiter(limiter =>
{
    limiter.AddPolicy("chat", context => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(context),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = agentOptions.RateLimitPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    limiter.OnRejected = async (context, cancellationToken) =>
    {
        AgentTelemetry.AdmissionRejected.Add(1, new KeyValuePair<string, object?>("reason", "rate_limited"));
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { code = "rate_limited", message = "Too many questions; try again in a minute." }, cancellationToken);
    };
});

var corsOrigin = builder.Configuration["Cors:Origin"];
if (!string.IsNullOrWhiteSpace(corsOrigin))
{
    builder.Services.AddCors(cors => cors.AddDefaultPolicy(policy => policy.WithOrigins(corsOrigin).AllowAnyHeader().WithMethods("GET", "POST")));
}

// OpenTelemetry: traces and metrics over OTLP/HTTP to the node-local collector, like cms-backend.
// Resource attributes from OTEL_RESOURCE_ATTRIBUTES (deployment.environment.name) are merged by the SDK.
var serviceName = builder.Configuration.GetValue<string>("OpenTelemetry:ServiceName") ?? AgentTelemetry.DefaultServiceName;
var serviceVersion = builder.Configuration.GetValue<string>("OpenTelemetry:ServiceVersion") ?? "1.0.0";
var otlpEndpoint = builder.Configuration.GetValue<string>("OpenTelemetry:OtlpEndpoint");

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(serviceName, serviceVersion: serviceVersion, serviceInstanceId: Environment.MachineName))
    .WithTracing(tracing =>
    {
        tracing
            // Like cms-backend: trace every chat even when the edge proxy forwards an unsampled traceparent
            // (Envoy samples a small share of requests; the default parent-based sampler would drop the rest).
            .SetSampler(new AlwaysOnSampler())
            .AddSource(AgentTelemetry.SourceName, AgentTelemetry.GenAiSourceName)
            .AddAspNetCoreInstrumentation(options =>
            {
                options.Filter = context => context.Request.Path.StartsWithSegments("/api");
                options.RecordException = true;
            })
            .AddHttpClientInstrumentation(options =>
            {
                options.RecordException = true;
                // Readiness probes of the model endpoint are noise; real chat calls are POSTs.
                options.FilterHttpRequestMessage = request =>
                    !(request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath.EndsWith("/models", StringComparison.Ordinal) == true);
            });

        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            tracing.AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri(otlpEndpoint.TrimEnd('/') + "/v1/traces");
                options.Protocol = OtlpExportProtocol.HttpProtobuf;
            });
        }
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddMeter(AgentTelemetry.SourceName, AgentTelemetry.GenAiSourceName)
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation();

        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            metrics.AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri(otlpEndpoint.TrimEnd('/') + "/v1/metrics");
                options.Protocol = OtlpExportProtocol.HttpProtobuf;
            });
        }
    });

// JSON logs on stdout (collected by the node agent) with trace and span ids for log-trace correlation.
builder.Logging.ClearProviders();
builder.Logging.Configure(options => options.ActivityTrackingOptions =
    ActivityTrackingOptions.TraceId | ActivityTrackingOptions.SpanId | ActivityTrackingOptions.ParentId);
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
    options.UseUtcTimestamp = true;
    options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
});

var app = builder.Build();

if (!string.IsNullOrWhiteSpace(corsOrigin))
{
    app.UseCors();
}
app.UseRateLimiter();

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy" }));
app.MapGet("/ready", () => Results.Ok(new { status = "ready" }));

app.MapGet("/api/agent/health", async (LlmHealth health, IOptions<LlmOptions> llm, CancellationToken cancellationToken) =>
{
    var ready = await health.IsReadyAsync(cancellationToken);
    return Results.Ok(new { status = "ok", llm = ready ? "ready" : "unavailable", model = llm.Value.Model });
});

app.MapPost("/api/agent/chat", async (
        HttpContext context,
        ChatRequest request,
        AgentChatService chat,
        LlmHealth health,
        ConcurrencyLimiter concurrency,
        IOptions<AgentOptions> options) =>
    {
        var errors = ChatRequestValidator.Validate(request, options.Value);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var cancellationToken = context.RequestAborted;
        if (!await health.IsReadyAsync(cancellationToken))
        {
            AgentTelemetry.AdmissionRejected.Add(1, new KeyValuePair<string, object?>("reason", "llm_unavailable"));
            return Results.Json(new { code = "llm_unavailable", message = "The assistant is starting or unavailable." },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        using var lease = await concurrency.AcquireAsync(1, cancellationToken);
        if (!lease.IsAcquired)
        {
            AgentTelemetry.AdmissionRejected.Add(1, new KeyValuePair<string, object?>("reason", "busy"));
            context.Response.Headers.RetryAfter = "10";
            return Results.Json(new { code = "busy", message = "The assistant is busy; try again shortly." },
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        await using var sse = new SseWriter(context.Response, TimeSpan.FromSeconds(options.Value.HeartbeatSeconds), cancellationToken);
        await sse.StartAsync();
        await chat.RunAsync(request, sse, cancellationToken);
        return Results.Empty;
    })
    .RequireRateLimiting("chat");

app.Run();

// Envoy appends the peer address to X-Forwarded-For, so the rightmost entry is the one a client cannot forge.
static string ClientKey(HttpContext context)
{
    var forwarded = context.Request.Headers["X-Forwarded-For"].ToString();
    if (!string.IsNullOrWhiteSpace(forwarded))
    {
        return forwarded.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Last();
    }

    return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}

public partial class Program { }
