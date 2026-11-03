using DemoCms.Core.DTOs;

namespace DemoCms.Core.Interfaces;

/// <summary>Read-only queries over the media library: filtered search and aggregate statistics.</summary>
public interface IMediaQueryService
{
    Task<PagedResult<MediaDto>> SearchAsync(MediaSearchQuery query, CancellationToken cancellationToken = default);
    Task<MediaStatsDto> GetStatsAsync(MediaStatsQuery query, CancellationToken cancellationToken = default);
}
