using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace DemoCms.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MediaController : ControllerBase
{
    private readonly IMediaService _mediaService;
    private readonly ILogger<MediaController> _logger;

    public MediaController(IMediaService mediaService, ILogger<MediaController> logger)
    {
        _mediaService = mediaService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MediaDto>>> GetAll()
    {
        _logger.LogInformation("Getting all media items");
        var media = await _mediaService.GetAllAsync();
        return Ok(media);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MediaDto>> GetById(Guid id)
    {
        _logger.LogInformation("Getting media item by ID: {MediaId}", id);
        var media = await _mediaService.GetByIdAsync(id);
        
        if (media == null)
        {
            return NotFound();
        }

        return Ok(media);
    }

    [HttpGet("tags")]
    public async Task<ActionResult<IEnumerable<string>>> GetAllTags()
    {
        _logger.LogInformation("Getting all tags");
        var tags = await _mediaService.GetAllTagsAsync();
        return Ok(tags);
    }

    [HttpGet("filter")]
    public async Task<ActionResult<IEnumerable<MediaDto>>> FilterByTags([FromQuery] string? tags)
    {
        _logger.LogInformation("Filtering media by tags: {Tags}", tags);
        
        if (string.IsNullOrWhiteSpace(tags))
        {
            var allMedia = await _mediaService.GetAllAsync();
            return Ok(allMedia);
        }

        var tagList = tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .ToList();

        var media = await _mediaService.GetByTagsAsync(tagList);
        return Ok(media);
    }

    [HttpPost]
    public async Task<ActionResult<MediaDto>> Upload([FromForm] IFormFileCollection files, [FromForm] string? title, [FromForm] string? description, [FromForm] string? tags)
    {
        if (files == null || files.Count == 0)
        {
            return BadRequest("No files uploaded");
        }

        var file = files[0]; // For now, handle single file upload
        
        // Validate file type
        var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain", "text/html", "text/csv" };
        if (!allowedTypes.Contains(file.ContentType.ToLowerInvariant()))
        {
            return BadRequest("Only JPEG, PNG, GIF, WebP images and plain/text/html/csv files are allowed");
        }

        // Validate file size (5MB max as per PRD)
        const int maxSizeBytes = 5 * 1024 * 1024;
        if (file.Length > maxSizeBytes)
        {
            return BadRequest("File size must be less than 5MB");
        }

        _logger.LogInformation("Uploading file: {FileName}, Size: {FileSize}, Tags: {Tags}", file.FileName, file.Length, tags);

        // Parse tags from comma-separated string
        List<string>? tagList = null;
        if (!string.IsNullOrWhiteSpace(tags))
        {
            tagList = tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList();
        }

        var uploadDto = new UploadMediaDto
        {
            FileName = file.FileName,
            Title = title ?? Path.GetFileNameWithoutExtension(file.FileName),
            Description = description,
            ContentType = file.ContentType,
            Size = file.Length,
            Content = file.OpenReadStream(),
            Tags = tagList
        };

        try
        {
            var media = await _mediaService.UploadAsync(uploadDto);
            return CreatedAtAction(nameof(GetById), new { id = media.Id }, media);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading file: {FileName}", file.FileName);
            return StatusCode(500, "An error occurred while uploading the file");
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<MediaDto>> Update(Guid id, [FromBody] UpdateMediaDto updateDto)
    {
        _logger.LogInformation("Updating media item: {MediaId}", id);
        
        var media = await _mediaService.UpdateAsync(id, updateDto);
        
        if (media == null)
        {
            return NotFound();
        }

        return Ok(media);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        _logger.LogInformation("Deleting media item: {MediaId}", id);
        
        var success = await _mediaService.DeleteAsync(id);
        
        if (!success)
        {
            return NotFound();
        }

        return NoContent();
    }

    [HttpGet("{id}/file")]
    public async Task<ActionResult> GetFile(Guid id)
    {
        _logger.LogInformation("Getting file for media item: {MediaId}", id);
        
        var media = await _mediaService.GetByIdAsync(id);
        if (media == null)
        {
            return NotFound();
        }

        var fileStream = await _mediaService.GetFileStreamAsync(id);
        if (fileStream == null)
        {
            return NotFound("File not found");
        }

        return File(fileStream, media.ContentType, media.FileName);
    }
}
