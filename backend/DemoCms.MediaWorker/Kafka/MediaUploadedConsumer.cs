using System.Text.Json;
using Confluent.Kafka;
using DemoCms.Core.DTOs;
using DemoCms.MediaWorker.Options;
using DemoCms.MediaWorker.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DemoCms.MediaWorker.Kafka;

public class MediaUploadedConsumer : BackgroundService
{
    private readonly KafkaConsumerOptions _options;
    private readonly IMediaUpdateClient _mediaUpdateClient;
    private readonly IImageDescriptionService _descriptionService;
    private readonly ILogger<MediaUploadedConsumer> _logger;

    public MediaUploadedConsumer(
        IOptions<KafkaConsumerOptions> options,
        IMediaUpdateClient mediaUpdateClient,
        IImageDescriptionService descriptionService,
        ILogger<MediaUploadedConsumer> logger)
    {
        _options = options.Value;
        _mediaUpdateClient = mediaUpdateClient;
        _descriptionService = descriptionService;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.BootstrapServers))
        {
            _logger.LogWarning("Kafka BootstrapServers not configured. Consumer will not start.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_options.Topic))
        {
            _logger.LogWarning("Kafka topic not configured. Consumer will not start.");
            return;
        }

        var config = new ConsumerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            GroupId = _options.GroupId,
            EnableAutoCommit = _options.EnableAutoCommit
        };

        if (Enum.TryParse<AutoOffsetReset>(_options.AutoOffsetReset, true, out var offsetReset))
        {
            config.AutoOffsetReset = offsetReset;
        }

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_options.Topic);

        _logger.LogInformation("Kafka consumer started for topic {Topic}", _options.Topic);

        while (!stoppingToken.IsCancellationRequested)
        {
            ConsumeResult<string, string>? result = null;
            try
            {
                result = consumer.Consume(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ConsumeException ex)
            {
                _logger.LogError(ex, "Kafka consume error");
                continue;
            }

            if (result?.Message == null)
            {
                continue;
            }

            _logger.LogInformation(
                "Received media event from topic {Topic} at offset {Offset} with key {Key}",
                result.Topic,
                result.Offset,
                result.Message.Key);

            var mediaEvent = Deserialize(result.Message.Value);
            if (mediaEvent == null || mediaEvent.MediaId == Guid.Empty)
            {
                _logger.LogWarning("Invalid media event payload: {Payload}", result.Message.Value);
                consumer.Commit(result);
                continue;
            }

            _logger.LogInformation("Processing media event for {MediaId}", mediaEvent.MediaId);
            var imageBytes = await _mediaUpdateClient.GetMediaBytesAsync(
                mediaEvent.MediaId,
                mediaEvent.MediaUrl,
                stoppingToken);
            if (imageBytes == null)
            {
                _logger.LogWarning("Failed to load image for {MediaId}", mediaEvent.MediaId);
                continue;
            }

            var description = await _descriptionService.GenerateDescriptionAsync(imageBytes, stoppingToken);
            if (string.IsNullOrWhiteSpace(description))
            {
                _logger.LogWarning("No description generated for {MediaId}", mediaEvent.MediaId);
                continue;
            }

            _logger.LogInformation("Description generated for {MediaId}", mediaEvent.MediaId);
            var updated = await _mediaUpdateClient.UpdateDescriptionAsync(mediaEvent.MediaId, description, stoppingToken);
            if (!updated)
            {
                continue;
            }

            _logger.LogInformation("Description updated for {MediaId}", mediaEvent.MediaId);
            consumer.Commit(result);
        }

        consumer.Close();
    }

    private static MediaUploadedEvent? Deserialize(string payload)
    {
        try
        {
            return JsonSerializer.Deserialize<MediaUploadedEvent>(
                payload,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }
}
