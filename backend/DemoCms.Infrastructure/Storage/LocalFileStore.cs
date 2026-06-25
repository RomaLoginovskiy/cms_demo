using DemoCms.Core.Interfaces;

namespace DemoCms.Infrastructure.Storage;

public class LocalFileStore : IMediaStore
{
    private readonly string _storagePath;
    private readonly string _storageRoot;

    public LocalFileStore(string storagePath)
    {
        _storagePath = storagePath;
        _storageRoot = Path.GetFullPath(_storagePath);
        
        // Ensure the storage directory exists
        if (!Directory.Exists(_storageRoot))
        {
            Directory.CreateDirectory(_storageRoot);
        }
    }

    public async Task<string> StoreAsync(string fileName, Stream content, CancellationToken cancellationToken = default)
    {
        // Generate a unique file name to prevent conflicts
        var uniqueFileName = $"{Guid.NewGuid()}_{SafeFileName(fileName)}";
        var filePath = ResolvePath(uniqueFileName);

        using var fileStream = new FileStream(filePath, FileMode.Create);
        await content.CopyToAsync(fileStream, cancellationToken);

        return uniqueFileName;
    }

    public Task<Stream> GetAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = ResolvePath(fileName);
        
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File {fileName} not found.");
        }

        return Task.FromResult<Stream>(new FileStream(filePath, FileMode.Open, FileAccess.Read));
    }

    public Task DeleteAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = ResolvePath(fileName);
        
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }

        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var filePath = ResolvePath(fileName);
        return Task.FromResult(File.Exists(filePath));
    }

    private string ResolvePath(string fileName)
    {
        var fullPath = Path.GetFullPath(Path.Combine(_storageRoot, SafeFileName(fileName)));
        if (!fullPath.StartsWith(_storageRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            && fullPath != _storageRoot)
        {
            throw new InvalidOperationException("Resolved media path escaped storage root.");
        }

        return fullPath;
    }

    private static string SafeFileName(string fileName)
    {
        var safeName = Path.GetFileName(fileName);
        return string.IsNullOrWhiteSpace(safeName) ? "media" : safeName;
    }
} 