using DemoCms.Core.DTOs;

namespace DemoCms.Core.Interfaces;

public interface IMediaEventProducer
{
    Task PublishMediaUploadedAsync(MediaUploadedEvent mediaEvent, CancellationToken cancellationToken = default);
}
