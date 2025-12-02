namespace DemoCms.Core.Interfaces;

public interface IMediaStore
{
    Task<string> StoreAsync(string fileName, Stream content, CancellationToken cancellationToken = default);
    Task<Stream> GetAsync(string fileName, CancellationToken cancellationToken = default);
    Task DeleteAsync(string fileName, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string fileName, CancellationToken cancellationToken = default);
} 