namespace Whiteboard.Domain;

public sealed class Board
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public List<Shape> Shapes { get; set; } = [];
}
