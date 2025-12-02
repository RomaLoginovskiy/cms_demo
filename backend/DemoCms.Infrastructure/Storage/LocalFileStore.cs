using DemoCms.Core.Interfaces;

namespace DemoCms.Infrastructure.Storage;

public class LocalFileStore : IMediaStore
{
    private readonly string _storagePath;

    public LocalFileStore(string storagePath)
    {
        _storagePath = storagePath;
        
        // Ensure the storage directory exists
        if (!Directory.Exists(_storagePath))
        {
            Directory.CreateDirectory(_storagePath);
        }
    }

    public async Task<string> StoreAsync(string fileName, Stream content, CancellationToken cancellationToken = default)
    {
        // Generate a unique file name to prevent conflicts
        var uniqueFileName = $"{Guid.NewGuid()}_{fileName}";
        var filePath = Path.Combine(_storagePath, uniqueFileName);

        using var fileStream = new FileStream(filePath, FileMode.Create);
        await content.CopyToAsync(fileStream, cancellationToken);

        return uniqueFileName;
    }

    public async Task<Stream> GetAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = Path.Combine(_storagePath, fileName);
        
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File {fileName} not found.");
        }

        return new FileStream(filePath, FileMode.Open, FileAccess.Read);
    }

    public Task DeleteAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = Path.Combine(_storagePath, fileName);
        
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }

        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = Path.Combine(_storagePath, fileName);
        return Task.FromResult(File.Exists(filePath));
    }
} 