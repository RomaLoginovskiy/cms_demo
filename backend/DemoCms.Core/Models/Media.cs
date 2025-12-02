using System.ComponentModel.DataAnnotations;

namespace DemoCms.Core.Models;

public class Media
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(256)]
    public string FileName { get; set; } = string.Empty;
    
    [MaxLength(256)]
    public string? Title { get; set; }
    
    public string? Description { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;
    
    [Required]
    public long Size { get; set; }
    
    [Required]
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
} 