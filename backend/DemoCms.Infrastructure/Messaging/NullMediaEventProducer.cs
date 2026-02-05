using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;

namespace DemoCms.Infrastructure.Messaging;

public class NullMediaEventProducer : IMediaEventProducer
{
    public Task PublishMediaUploadedAsync(MediaUploadedEvent mediaEvent, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }
}
