using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Whiteboard.Infrastructure;

internal sealed class WhiteboardDatabaseHostedService(
    IServiceProvider services,
    IConfiguration configuration) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        WhiteboardDatabaseInitializer.InitializeAsync(services, configuration, cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
