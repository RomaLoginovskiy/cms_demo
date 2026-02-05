using System.Net.Http.Json;
using DemoCms.Core.DTOs;
using DemoCms.MediaWorker.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DemoCms.MediaWorker.Services;

public class MediaUpdateClient : IMediaUpdateClient
{
    private readonly HttpClient _httpClient;
    private readonly ApiOptions _options;
    private readonly ILogger<MediaUpdateClient> _logger;

    public MediaUpdateClient(
        HttpClient httpClient,
        IOptions<ApiOptions> options,
        ILogger<MediaUpdateClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<byte[]?> GetMediaBytesAsync(Guid mediaId, string? mediaUrl, CancellationToken cancellationToken = default)
    {
        var url = ResolveMediaUrl(mediaId, mediaUrl);
        if (string.IsNullOrWhiteSpace(url))
        {
            _logger.LogWarning("Media URL not provided for {MediaId}", mediaId);
            return null;
        }

        try
        {
            return await _httpClient.GetByteArrayAsync(url, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch media bytes for {MediaId}", mediaId);
            return null;
        }
    }

    public async Task<bool> UpdateDescriptionAsync(Guid mediaId, string description, CancellationToken cancellationToken = default)
    {
        var updateDto = new UpdateMediaDto
        {
            Description = description
        };

        try
        {
            var response = await _httpClient.PutAsJsonAsync($"/api/media/{mediaId}", updateDto, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to update media {MediaId}. Status: {StatusCode}", mediaId, response.StatusCode);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating media description for {MediaId}", mediaId);
            return false;
        }
    }

    private string? ResolveMediaUrl(Guid mediaId, string? mediaUrl)
    {
        if (!string.IsNullOrWhiteSpace(mediaUrl))
        {
            return mediaUrl;
        }

        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            return null;
        }

        return $"{_options.BaseUrl.TrimEnd('/')}/api/media/{mediaId}/file";
    }
}
