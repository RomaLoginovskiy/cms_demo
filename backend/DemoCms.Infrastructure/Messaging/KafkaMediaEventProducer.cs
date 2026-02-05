using System.Text.Json;
using Confluent.Kafka;
using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DemoCms.Infrastructure.Messaging;

public class KafkaMediaEventProducer : IMediaEventProducer, IDisposable
{
    private readonly MediaEventOptions _options;
    private readonly ILogger<KafkaMediaEventProducer> _logger;
    private readonly IProducer<string, string>? _producer;

    public KafkaMediaEventProducer(IOptions<MediaEventOptions> options, ILogger<KafkaMediaEventProducer> logger)
    {
        _options = options.Value;
        _logger = logger;

        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.BootstrapServers))
        {
            return;
        }

        var config = new ProducerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            ClientId = "demo-cms-api"
        };

        _producer = new ProducerBuilder<string, string>(config).Build();
    }

    public async Task PublishMediaUploadedAsync(MediaUploadedEvent mediaEvent, CancellationToken cancellationToken = default)
    {
        if (_producer == null || !_options.Enabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(_options.Topic))
        {
            _logger.LogWarning("Kafka topic is not configured for media events.");
            return;
        }

        try
        {
            var payload = JsonSerializer.Serialize(mediaEvent);
            var message = new Message<string, string>
            {
                Key = mediaEvent.MediaId.ToString(),
                Value = payload
            };

            _logger.LogInformation("Publishing media uploaded event to topic {Topic} for {MediaId}", _options.Topic, mediaEvent.MediaId);
            var deliveryResult = await _producer.ProduceAsync(_options.Topic, message, cancellationToken);

            if (deliveryResult.Status == PersistenceStatus.NotPersisted)
            {
                _logger.LogError(
                    "Failed to publish media uploaded event for {MediaId} to {Topic}. Status {Status}. Partition {Partition}, Offset {Offset}.",
                    mediaEvent.MediaId,
                    _options.Topic,
                    deliveryResult.Status,
                    deliveryResult.Partition,
                    deliveryResult.Offset);
                return;
            }

            _logger.LogInformation(
                "Published media uploaded event for {MediaId} to {Topic}. Partition {Partition}, Offset {Offset}.",
                mediaEvent.MediaId,
                _options.Topic,
                deliveryResult.Partition,
                deliveryResult.Offset);
        }
        catch (ProduceException<string, string> ex)
        {
            _logger.LogError(
                ex,
                "Failed to publish media uploaded event for {MediaId} to {Topic}. Error {ErrorCode}: {ErrorReason}.",
                mediaEvent.MediaId,
                _options.Topic,
                ex.Error.Code,
                ex.Error.Reason);
        }
        catch (KafkaException ex)
        {
            _logger.LogError(
                ex,
                "Kafka error while publishing media uploaded event for {MediaId} to {Topic}.",
                mediaEvent.MediaId,
                _options.Topic);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish media uploaded event for {MediaId}", mediaEvent.MediaId);
        }
    }

    public void Dispose()
    {
        _producer?.Flush(TimeSpan.FromSeconds(5));
        _producer?.Dispose();
    }
}
