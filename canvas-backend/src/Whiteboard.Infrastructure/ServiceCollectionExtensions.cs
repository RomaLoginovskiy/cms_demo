using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Whiteboard.Infrastructure;

public static class ServiceCollectionExtensions
{
    private const string DefaultConnectionString = "Data Source=data/whiteboard.db";

    public static IServiceCollection AddWhiteboardInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Sqlite") ?? DefaultConnectionString;

        services.AddDbContext<WhiteboardDbContext>(options => options.UseSqlite(connectionString));
        services.AddHostedService<WhiteboardDatabaseHostedService>();
        return services;
    }
}
