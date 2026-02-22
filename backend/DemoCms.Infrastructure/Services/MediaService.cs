// Update MediaService to use ElasticService
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using DemoCms.Core.Models;
using DemoCms.Infrastructure.Data;
using DemoCms.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Diagnostics;

namespace DemoCms.Infrastructure.Services
{
    public class MediaService : IMediaService
    {
        private static readonly ActivitySource ActivitySource = new("demo-cms-api");

        private readonly MediaDbContext _context;
        private readonly IMediaStore _mediaStore;
        private readonly ILogger<MediaService> _logger;
        private readonly IMediaEventProducer _mediaEventProducer;
        private readonly MediaEventOptions _eventOptions;
        private readonly IElasticService _elasticService;

        public MediaService(
            MediaDbContext context,
            IMediaStore mediaStore,
            ILogger<MediaService> logger,
            IMediaEventProducer mediaEventProducer,
            IOptions<MediaEventOptions> eventOptions,
            IElasticService elasticService)
        {
            _context = context;
            _mediaStore = mediaStore;
            _logger = logger;
            _mediaEventProducer = mediaEventProducer;
            _eventOptions = eventOptions.Value;
            _elasticService = elasticService;
        }

        // ... (rest of existing code unchanged until UploadAsync)

        public async Task<MediaDto> UploadAsync(UploadMediaDto uploadDto, CancellationToken cancellationToken = default)
        {
            _logger.LogInformation("Uploading media file: {FileName}", uploadDto.FileName);

            // Read file into memory for both storage and potential ES indexing
            byte[] fileBytes;
            using (var memory = new MemoryStream())
            {
                await uploadDto.Content.CopyToAsync(memory, cancellationToken);
                fileBytes = memory.ToArray();
            }
            // Reset stream for storage
            using var storageStream = new MemoryStream(fileBytes);

            // Store the file
            var storedFileName = await _mediaStore.StoreAsync(uploadDto.FileName, storageStream, cancellationToken);

            // Create database record
            var media = new Media
            {
                FileName = storedFileName,
                Title = uploadDto.Title,
                Description = uploadDto.Description,
                ContentType = uploadDto.ContentType,
                Size = uploadDto.Size,
                UploadedAt = DateTimeOffset.UtcNow
            };

            _context.Media.Add(media);
            await _context.SaveChangesAsync(cancellationToken);

            // Handle tags if provided
            if (uploadDto.Tags != null && uploadDto.Tags.Count > 0)
            {
                using var tagActivity = ActivitySource.StartActivity("media.tags.associate");
                tagActivity?.SetTag("media.id", media.Id.ToString());
                tagActivity?.SetTag("tags.count", uploadDto.Tags.Count);
                tagActivity?.SetTag("tags.names", string.Join(",", uploadDto.Tags));

                tagActivity?.AddEvent(new ActivityEvent("Starting tag association", tags: new ActivityTagsCollection
                {
                    { "media.id", media.Id.ToString() },
                    { "tags.requested_count", uploadDto.Tags.Count }
                }));

                var tags = await GetOrCreateTagsAsync(uploadDto.Tags, cancellationToken);

                tagActivity?.AddEvent(new ActivityEvent("Tags resolved", tags: new ActivityTagsCollection
                {
                    { "tags.resolved_count", tags.Count },
                    { "tags.resolved_names", string.Join(",", tags.Select(t => t.Name)) }
                }));

                foreach (var tag in tags)
                {
                    media.MediaTags.Add(new MediaTag { MediaId = media.Id, TagId = tag.Id, Tag = tag, Media = media });
                }
                await _context.SaveChangesAsync(cancellationToken);

                tagActivity?.AddEvent(new ActivityEvent("Tags associated", tags: new ActivityTagsCollection
                {
                    { "tags.associated_count", tags.Count }
                }));
            }

            var mediaUrl = BuildMediaUrl(_eventOptions.PublicBaseUrl, media.Id);
            await _mediaEventProducer.PublishMediaUploadedAsync(new MediaUploadedEvent
            {
                MediaId = media.Id,
                MediaUrl = mediaUrl,
                FileName = media.FileName,
                ContentType = media.ContentType,
                UploadedAt = media.UploadedAt,
                Title = media.Title,
                Tags = uploadDto.Tags
            }, cancellationToken);

            // If this is a text file, index into Elasticsearch
            if (uploadDto.ContentType.StartsWith("text/"))
            {
                string contentText;
                using (var reader = new StreamReader(new MemoryStream(fileBytes)))
                {
                    contentText = await reader.ReadToEndAsync(cancellationToken);
                }
                var doc = new MediaDocument
                {
                    Id = media.Id,
                    Title = media.Title,
                    Content = contentText,
                    Tags = uploadDto.Tags,
                    UploadedAt = media.UploadedAt
                };
                await _elasticService.IndexDocumentAsync(doc, cancellationToken);
            }

            _logger.LogInformation("Media uploaded successfully with ID: {MediaId}", media.Id);

            return MapToDto(media);
        }

        // ... rest of existing methods remain unchanged
    }
}
