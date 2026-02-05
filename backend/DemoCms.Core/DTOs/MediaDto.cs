namespace DemoCms.Core.DTOs;

public class MediaDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
    public List<string> Tags { get; set; } = new List<string>();
}

public class UpdateMediaDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public List<string>? Tags { get; set; }
}

public class UploadMediaDto
{
    public string FileName { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public Stream Content { get; set; } = Stream.Null;
    public List<string>? Tags { get; set; }
} 