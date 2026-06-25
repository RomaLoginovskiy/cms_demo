using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DemoCms.Infrastructure.Services;

public sealed class ElasticConfigurationWarningHostedService : IHostedService
{
    private readonly ILogger<ElasticConfigurationWarningHostedService> _logger;

    public ElasticConfigurationWarningHostedService(ILogger<ElasticConfigurationWarningHostedService> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogWarning("Elasticsearch URL is not configured. Media text indexing is disabled.");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
