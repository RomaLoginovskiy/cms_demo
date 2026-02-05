using System.ComponentModel.DataAnnotations;

namespace DemoCms.Core.Models;

public class Tag
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string Name { get; set; } = string.Empty;
    
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    
    public ICollection<MediaTag> MediaTags { get; set; } = new List<MediaTag>();
}

