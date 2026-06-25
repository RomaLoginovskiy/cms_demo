using DemoCms.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DemoCms.Api
{
    public static class ElasticExtensions
    {
        public static IServiceCollection AddElastic(this IServiceCollection services, IConfiguration configuration)
        {
            services.Configure<ElasticOptions>(configuration.GetSection("Elasticsearch"));

            var options = configuration.GetSection("Elasticsearch").Get<ElasticOptions>();
            if (string.IsNullOrWhiteSpace(options?.Url))
            {
                services.AddSingleton<IElasticService, NullElasticService>();
                services.AddHostedService<ElasticConfigurationWarningHostedService>();
                return services;
            }

            services.AddHttpClient<IElasticService, ElasticService>(client =>
            {
                client.BaseAddress = new Uri(options.Url);
            });
            return services;
        }
    }
}
