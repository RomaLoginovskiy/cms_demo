using DemoCms.Core.DTOs;

namespace DemoCms.MediaWorker.Services;

public interface IMediaUpdateClient
{
    Task<bool> UpdateDescriptionAsync(Guid mediaId, string description, CancellationToken cancellationToken = default);
    Task<byte[]?> GetMediaBytesAsync(Guid mediaId, string? mediaUrl, CancellationToken cancellationToken = default);
}
