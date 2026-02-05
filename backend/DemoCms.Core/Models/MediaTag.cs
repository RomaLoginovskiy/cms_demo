namespace DemoCms.Core.Models;

public class MediaTag
{
    public Guid MediaId { get; set; }
    public Media Media { get; set; } = null!;
    
    public Guid TagId { get; set; }
    public Tag Tag { get; set; } = null!;
}

