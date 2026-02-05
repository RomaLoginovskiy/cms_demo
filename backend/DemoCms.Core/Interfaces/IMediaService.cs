using DemoCms.Core.DTOs;
using DemoCms.Core.Models;

namespace DemoCms.Core.Interfaces;

public interface IMediaService
{
    Task<IEnumerable<MediaDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<MediaDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MediaDto> UploadAsync(UploadMediaDto uploadDto, CancellationToken cancellationToken = default);
    Task<MediaDto?> UpdateAsync(Guid id, UpdateMediaDto updateDto, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Stream?> GetFileStreamAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IEnumerable<MediaDto>> GetByTagsAsync(List<string> tags, CancellationToken cancellationToken = default);
    Task<IEnumerable<string>> GetAllTagsAsync(CancellationToken cancellationToken = default);
} 