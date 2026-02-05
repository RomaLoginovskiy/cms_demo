namespace DemoCms.MediaWorker.Services;

public interface IImageDescriptionService
{
    Task<string?> GenerateDescriptionAsync(byte[] imageBytes, CancellationToken cancellationToken = default);
}
