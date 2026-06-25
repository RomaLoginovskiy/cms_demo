using System.Diagnostics;
using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using DemoCms.Core.Models;
using DemoCms.Infrastructure.Data;
using DemoCms.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DemoCms.Infrastructure.Services;

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

    public async Task<IEnumerable<MediaDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving all media items");

        var media = await _context.Media
            .Include(m => m.MediaTags)
            .ThenInclude(mt => mt.Tag)
            .ToListAsync(cancellationToken);

        var orderedMedia = media.OrderByDescending(m => m.UploadedAt);

        return orderedMedia.Select(MapToDto);
    }

    public async Task<MediaDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving media item with ID: {MediaId}", id);

        var media = await _context.Media
            .Include(m => m.MediaTags)
            .ThenInclude(mt => mt.Tag)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (media == null)
        {
            return null;
        }

        return MapToDto(media);
    }

    public async Task<MediaDto> UploadAsync(UploadMediaDto uploadDto, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Uploading media file: {FileName}", uploadDto.FileName);

        byte[] fileBytes;
        using (var memory = new MemoryStream())
        {
            await uploadDto.Content.CopyToAsync(memory, cancellationToken);
            fileBytes = memory.ToArray();
        }

        using var storageStream = new MemoryStream(fileBytes);
        var storedFileName = await _mediaStore.StoreAsync(uploadDto.FileName, storageStream, cancellationToken);

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

    public async Task<MediaDto?> UpdateAsync(Guid id, UpdateMediaDto updateDto, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating media item with ID: {MediaId}", id);

        var media = await _context.Media
            .Include(m => m.MediaTags)
            .ThenInclude(mt => mt.Tag)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (media == null)
        {
            return null;
        }

        media.Title = updateDto.Title;
        media.Description = updateDto.Description;

        if (updateDto.Tags != null)
        {
            using var tagActivity = ActivitySource.StartActivity("media.tags.update");
            var previousTagCount = media.MediaTags.Count;
            var previousTagNames = media.MediaTags.Select(mt => mt.Tag.Name).ToList();

            tagActivity?.SetTag("media.id", id.ToString());
            tagActivity?.SetTag("tags.previous_count", previousTagCount);
            tagActivity?.SetTag("tags.new_count", updateDto.Tags.Count);
            tagActivity?.SetTag("tags.previous_names", string.Join(",", previousTagNames));
            tagActivity?.SetTag("tags.new_names", string.Join(",", updateDto.Tags));

            tagActivity?.AddEvent(new ActivityEvent("Starting tag update", tags: new ActivityTagsCollection
            {
                { "media.id", id.ToString() },
                { "tags.previous_count", previousTagCount },
                { "tags.new_count", updateDto.Tags.Count }
            }));

            _context.MediaTags.RemoveRange(media.MediaTags);
            media.MediaTags.Clear();

            tagActivity?.AddEvent(new ActivityEvent("Removing existing tags", tags: new ActivityTagsCollection
            {
                { "tags.removed_count", previousTagCount },
                { "tags.removed_names", string.Join(",", previousTagNames) }
            }));

            if (updateDto.Tags.Count > 0)
            {
                var tags = await GetOrCreateTagsAsync(updateDto.Tags, cancellationToken);

                tagActivity?.AddEvent(new ActivityEvent("Adding new tags", tags: new ActivityTagsCollection
                {
                    { "tags.adding_count", tags.Count },
                    { "tags.adding_names", string.Join(",", tags.Select(t => t.Name)) }
                }));

                foreach (var tag in tags)
                {
                    media.MediaTags.Add(new MediaTag { MediaId = media.Id, TagId = tag.Id, Tag = tag, Media = media });
                }
            }

            tagActivity?.AddEvent(new ActivityEvent("Tags update completed", tags: new ActivityTagsCollection
            {
                { "tags.final_count", media.MediaTags.Count }
            }));
        }

        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Media item updated successfully: {MediaId}", id);

        return MapToDto(media);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Deleting media item with ID: {MediaId}", id);

        var media = await _context.Media.FindAsync(new object[] { id }, cancellationToken);

        if (media == null)
        {
            return false;
        }

        try
        {
            await _mediaStore.DeleteAsync(media.FileName, cancellationToken);

            _context.Media.Remove(media);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media item deleted successfully: {MediaId}", id);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media item: {MediaId}", id);
            throw;
        }
    }

    public async Task<Stream?> GetFileStreamAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving file stream for media ID: {MediaId}", id);

        var media = await _context.Media.FindAsync(new object[] { id }, cancellationToken);

        if (media == null)
        {
            return null;
        }

        try
        {
            return await _mediaStore.GetAsync(media.FileName, cancellationToken);
        }
        catch (FileNotFoundException)
        {
            _logger.LogWarning("File not found for media ID: {MediaId}", id);
            return null;
        }
    }

    public async Task<IEnumerable<MediaDto>> GetByTagsAsync(List<string> tags, CancellationToken cancellationToken = default)
    {
        using var activity = ActivitySource.StartActivity("media.tags.filter");
        activity?.SetTag("filter.tags", string.Join(",", tags ?? new List<string>()));
        activity?.SetTag("filter.tag_count", tags?.Count ?? 0);

        activity?.AddEvent(new ActivityEvent("Filter query started", tags: new ActivityTagsCollection
        {
            { "filter.tags", string.Join(",", tags ?? new List<string>()) },
            { "filter.tag_count", tags?.Count ?? 0 }
        }));

        _logger.LogInformation("Retrieving media items with tags: {Tags}", string.Join(", ", tags ?? new List<string>()));

        if (tags == null || tags.Count == 0)
        {
            activity?.AddEvent(new ActivityEvent("No tags provided, returning all media"));
            var allMedia = await GetAllAsync(cancellationToken);
            activity?.SetTag("result.count", allMedia.Count());
            return allMedia;
        }

        var normalizedTags = tags.Select(t => t.Trim().ToLowerInvariant()).ToList();

        activity?.AddEvent(new ActivityEvent("Filtering by tags", tags: new ActivityTagsCollection
        {
            { "filter.normalized_tags", string.Join(",", normalizedTags) }
        }));

        var media = await _context.Media
            .Include(m => m.MediaTags)
            .ThenInclude(mt => mt.Tag)
            .Where(m => m.MediaTags.Any(mt => normalizedTags.Contains(mt.Tag.Name.ToLower())))
            .ToListAsync(cancellationToken);

        var orderedMedia = media.OrderByDescending(m => m.UploadedAt);
        var result = orderedMedia.Select(MapToDto).ToList();

        activity?.SetTag("result.count", result.Count);
        activity?.AddEvent(new ActivityEvent("Filter completed", tags: new ActivityTagsCollection
        {
            { "result.count", result.Count },
            { "result.media_ids", string.Join(",", result.Select(m => m.Id)) }
        }));

        return result;
    }

    public async Task<IEnumerable<string>> GetAllTagsAsync(CancellationToken cancellationToken = default)
    {
        using var activity = ActivitySource.StartActivity("media.tags.get_all");

        activity?.AddEvent(new ActivityEvent("Tags query started"));

        _logger.LogInformation("Retrieving all tags");

        var tags = await _context.Tags
            .OrderBy(t => t.Name)
            .Select(t => t.Name)
            .ToListAsync(cancellationToken);

        activity?.SetTag("tags.total_count", tags.Count);
        activity?.AddEvent(new ActivityEvent("Tags query completed", tags: new ActivityTagsCollection
        {
            { "tags.total_count", tags.Count },
            { "tags.names", string.Join(",", tags) }
        }));

        return tags;
    }

    private async Task<List<Tag>> GetOrCreateTagsAsync(List<string> tagNames, CancellationToken cancellationToken = default)
    {
        using var activity = ActivitySource.StartActivity("media.tags.get_or_create");
        activity?.SetTag("tags.count", tagNames.Count);
        activity?.SetTag("tags.requested", string.Join(",", tagNames));

        var result = new List<Tag>();
        var tagIndex = 0;
        var existingCount = 0;
        var createdCount = 0;

        foreach (var tagName in tagNames.Distinct())
        {
            var normalizedName = tagName.Trim();
            if (string.IsNullOrWhiteSpace(normalizedName))
            {
                continue;
            }

            if (normalizedName.Length > 50)
            {
                normalizedName = normalizedName.Substring(0, 50);
            }

            activity?.AddEvent(new ActivityEvent("Processing tag", tags: new ActivityTagsCollection
            {
                { "tag.name", normalizedName },
                { "tag.index", tagIndex }
            }));

            var existingTag = await _context.Tags
                .FirstOrDefaultAsync(t => t.Name.ToLower() == normalizedName.ToLower(), cancellationToken);

            if (existingTag != null)
            {
                result.Add(existingTag);
                existingCount++;

                activity?.AddEvent(new ActivityEvent("Tag found existing", tags: new ActivityTagsCollection
                {
                    { "tag.name", existingTag.Name },
                    { "tag.id", existingTag.Id.ToString() },
                    { "tag.index", tagIndex }
                }));
            }
            else
            {
                var newTag = new Tag
                {
                    Name = normalizedName,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                _context.Tags.Add(newTag);
                await _context.SaveChangesAsync(cancellationToken);
                result.Add(newTag);
                createdCount++;

                activity?.AddEvent(new ActivityEvent("Tag created new", tags: new ActivityTagsCollection
                {
                    { "tag.name", newTag.Name },
                    { "tag.id", newTag.Id.ToString() },
                    { "tag.index", tagIndex }
                }));
            }

            tagIndex++;
        }

        activity?.SetTag("tags.existing_count", existingCount);
        activity?.SetTag("tags.created_count", createdCount);
        activity?.SetTag("tags.result_count", result.Count);

        return result;
    }

    private static MediaDto MapToDto(Media media)
    {
        return new MediaDto
        {
            Id = media.Id,
            FileName = media.FileName,
            Title = media.Title,
            Description = media.Description,
            ContentType = media.ContentType,
            Size = media.Size,
            UploadedAt = media.UploadedAt,
            Tags = media.MediaTags?.Select(mt => mt.Tag.Name).ToList() ?? new List<string>()
        };
    }

    private static string? BuildMediaUrl(string? publicBaseUrl, Guid mediaId)
    {
        if (string.IsNullOrWhiteSpace(publicBaseUrl))
        {
            return null;
        }

        var trimmed = publicBaseUrl.TrimEnd('/');
        return $"{trimmed}/api/media/{mediaId}/file";
    }
}
