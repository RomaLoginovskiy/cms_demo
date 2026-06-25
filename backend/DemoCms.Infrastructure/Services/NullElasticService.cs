namespace DemoCms.Infrastructure.Services;

public sealed class NullElasticService : IElasticService
{
    public Task IndexDocumentAsync(MediaDocument doc, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
