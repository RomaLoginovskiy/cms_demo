using DemoCms.Api;
using DemoCms.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DemoCms.MediaWorker.Tests.Services;

public sealed class ElasticExtensionsTests
{
    [Fact]
    public async Task AddElastic_UsesNoOpIndexerWhenElasticsearchUrlIsMissing()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();

        services.AddLogging();
        services.AddElastic(configuration);

        await using var provider = services.BuildServiceProvider();
        var elasticService = provider.GetRequiredService<IElasticService>();

        Assert.IsType<NullElasticService>(elasticService);
        await elasticService.IndexDocumentAsync(new MediaDocument { Id = Guid.NewGuid(), Title = "Demo" });
        Assert.Contains(provider.GetServices<IHostedService>(), service => service is ElasticConfigurationWarningHostedService);
    }

    [Fact]
    public void AddElastic_UsesHttpIndexerWhenElasticsearchUrlIsConfigured()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Elasticsearch:Url"] = "http://localhost:9200",
                ["Elasticsearch:IndexName"] = "media"
            })
            .Build();

        services.AddLogging();
        services.AddElastic(configuration);

        using var provider = services.BuildServiceProvider();
        var elasticService = provider.GetRequiredService<IElasticService>();

        Assert.IsType<ElasticService>(elasticService);
        Assert.DoesNotContain(provider.GetServices<IHostedService>(), service => service is ElasticConfigurationWarningHostedService);
    }
}
