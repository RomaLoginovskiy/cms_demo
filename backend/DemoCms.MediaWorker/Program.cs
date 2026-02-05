using DemoCms.MediaWorker.Kafka;
using DemoCms.MediaWorker.Options;
using DemoCms.MediaWorker.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using System.ClientModel;
using System.Collections.Generic;

var host = Host.CreateDefaultBuilder(args)
    .ConfigureLogging((context, logging) =>
    {
        logging.ClearProviders();
        logging.AddConsole();
        logging.AddOpenTelemetry(options =>
        {
            options.IncludeFormattedMessage = true;
            options.IncludeScopes = true;
            options.ParseStateValues = true;

            var otlpEndpoint = context.Configuration["OpenTelemetry:OtlpEndpoint"];
            var enableOtlpExporter = bool.TryParse(
                context.Configuration["OpenTelemetry:EnableOtlpExporter"],
                out var enableFromConfig)
                ? enableFromConfig
                : true;

            if (enableOtlpExporter && !string.IsNullOrEmpty(otlpEndpoint))
            {
                var fullEndpoint = otlpEndpoint.EndsWith("/v1/logs") ? otlpEndpoint : $"{otlpEndpoint}/v1/logs";
                options.AddOtlpExporter(otlpOptions =>
                {
                    otlpOptions.Endpoint = new Uri(fullEndpoint);
                    otlpOptions.Protocol = OtlpExportProtocol.HttpProtobuf;
                });
            }
        });
    })
    .ConfigureServices((context, services) =>
    {
        var serviceName = context.Configuration["OpenTelemetry:ServiceName"] ?? "demo-cms-media-worker";
        var serviceVersion = context.Configuration["OpenTelemetry:ServiceVersion"] ?? "1.0.0";

        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(serviceName, serviceVersion)
                .AddAttributes(new Dictionary<string, object>
                {
                    ["environment"] = context.HostingEnvironment.EnvironmentName,
                    ["service.instance.id"] = Environment.MachineName,
                    ["deployment.environment"] = context.HostingEnvironment.EnvironmentName
                }))
            .WithTracing(tracerProviderBuilder =>
            {
                tracerProviderBuilder
                    .AddSource(serviceName)
                    .SetSampler(new AlwaysOnSampler())
                    .AddHttpClientInstrumentation(options =>
                    {
                        options.RecordException = true;
                    });

                var otlpEndpoint = context.Configuration["OpenTelemetry:OtlpEndpoint"];
                if (!string.IsNullOrEmpty(otlpEndpoint))
                {
                    var fullEndpoint = otlpEndpoint.EndsWith("/v1/traces") ? otlpEndpoint : $"{otlpEndpoint}/v1/traces";
                    tracerProviderBuilder.AddOtlpExporter(options =>
                    {
                        options.Endpoint = new Uri(fullEndpoint);
                        options.Protocol = OtlpExportProtocol.HttpProtobuf;
                    });
                }
            })
            .WithMetrics(meterProviderBuilder =>
            {
                meterProviderBuilder.AddHttpClientInstrumentation();

                var otlpEndpoint = context.Configuration["OpenTelemetry:OtlpEndpoint"];
                var enableOtlpExporter = bool.TryParse(
                    context.Configuration["OpenTelemetry:EnableOtlpExporter"],
                    out var enableFromConfig)
                    ? enableFromConfig
                    : true;

                if (enableOtlpExporter && !string.IsNullOrEmpty(otlpEndpoint))
                {
                    var fullMetricsEndpoint = otlpEndpoint.EndsWith("/v1/metrics") ? otlpEndpoint : $"{otlpEndpoint}/v1/metrics";
                    meterProviderBuilder.AddOtlpExporter(options =>
                    {
                        options.Endpoint = new Uri(fullMetricsEndpoint);
                        options.Protocol = OtlpExportProtocol.HttpProtobuf;
                    });
                }
            });

        services.Configure<KafkaConsumerOptions>(context.Configuration.GetSection("Kafka"));
        services.Configure<OpenAiOptions>(context.Configuration.GetSection("OpenAI"));
        services.Configure<ApiOptions>(context.Configuration.GetSection("Api"));

        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<OpenAiOptions>>().Value;
            var clientOptions = new OpenAIClientOptions { Endpoint = new Uri(options.BaseUrl) };
            var credential = new ApiKeyCredential(options.ApiKey);
            return new ChatClient(options.Model, credential, clientOptions);
        });

        services.AddSingleton<IImageDescriptionService, LlamaDescriptionService>();

        services.AddHttpClient<IMediaUpdateClient, MediaUpdateClient>()
            .ConfigureHttpClient((sp, client) =>
            {
                var options = sp.GetRequiredService<IOptions<ApiOptions>>().Value;
                client.BaseAddress = new Uri(options.BaseUrl);
                client.Timeout = TimeSpan.FromSeconds(30);
            });

        services.AddHostedService<MediaUploadedConsumer>();
    })
    .Build();

await host.RunAsync();
