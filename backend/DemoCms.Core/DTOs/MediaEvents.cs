namespace DemoCms.Core.DTOs;

public class MediaEventOptions
{
    public bool Enabled { get; set; }
    public string BootstrapServers { get; set; } = string.Empty;
    public string Topic { get; set; } = "media.uploaded";
    public string? PublicBaseUrl { get; set; }
}

public class MediaUploadedEvent
{
    public Guid MediaId { get; set; }
    public string? MediaUrl { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public DateTimeOffset UploadedAt { get; set; }
    public string? Title { get; set; }
    public List<string>? Tags { get; set; }
}
