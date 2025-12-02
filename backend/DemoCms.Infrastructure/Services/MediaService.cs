using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using DemoCms.Core.Models;
using DemoCms.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DemoCms.Infrastructure.Services;

public class MediaService : IMediaService
{
    private readonly MediaDbContext _context;
    private readonly IMediaStore _mediaStore;
    private readonly ILogger<MediaService> _logger;

    public MediaService(MediaDbContext context, IMediaStore mediaStore, ILogger<MediaService> logger)
    {
        _context = context;
        _mediaStore = mediaStore;
        _logger = logger;
    }

    public async Task<IEnumerable<MediaDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving all media items");
        
        // Fetch all media items first
        var media = await _context.Media
            .ToListAsync(cancellationToken);

        // Order by UploadedAt in memory to avoid SQLite DateTimeOffset limitation
        var orderedMedia = media.OrderByDescending(m => m.UploadedAt);

        return orderedMedia.Select(m => new MediaDto
        {
            Id = m.Id,
            FileName = m.FileName,
            Title = m.Title,
            Description = m.Description,
            ContentType = m.ContentType,
            Size = m.Size,
            UploadedAt = m.UploadedAt
        });
    }

    public async Task<MediaDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving media item with ID: {MediaId}", id);
        
        var media = await _context.Media.FindAsync(new object[] { id }, cancellationToken);
        
        if (media == null)
        {
            return null;
        }

        return new MediaDto
        {
            Id = media.Id,
            FileName = media.FileName,
            Title = media.Title,
            Description = media.Description,
            ContentType = media.ContentType,
            Size = media.Size,
            UploadedAt = media.UploadedAt
        };
    }

    public async Task<MediaDto> UploadAsync(UploadMediaDto uploadDto, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Uploading media file: {FileName}", uploadDto.FileName);
        
        // Store the file
        var storedFileName = await _mediaStore.StoreAsync(uploadDto.FileName, uploadDto.Content, cancellationToken);
        
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

        _logger.LogInformation("Media uploaded successfully with ID: {MediaId}", media.Id);

        return new MediaDto
        {
            Id = media.Id,
            FileName = media.FileName,
            Title = media.Title,
            Description = media.Description,
            ContentType = media.ContentType,
            Size = media.Size,
            UploadedAt = media.UploadedAt
        };
    }

    public async Task<MediaDto?> UpdateAsync(Guid id, UpdateMediaDto updateDto, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating media item with ID: {MediaId}", id);
        
        var media = await _context.Media.FindAsync(new object[] { id }, cancellationToken);
        
        if (media == null)
        {
            return null;
        }

        media.Title = updateDto.Title;
        media.Description = updateDto.Description;

        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Media item updated successfully: {MediaId}", id);

        return new MediaDto
        {
            Id = media.Id,
            FileName = media.FileName,
            Title = media.Title,
            Description = media.Description,
            ContentType = media.ContentType,
            Size = media.Size,
            UploadedAt = media.UploadedAt
        };
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
            // Delete the file from storage
            await _mediaStore.DeleteAsync(media.FileName, cancellationToken);
            
            // Delete the database record
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
} 