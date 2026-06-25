namespace Whiteboard.Domain;

public sealed class Shape
{
    public Guid Id { get; set; }

    public Guid BoardId { get; set; }

    public Board? Board { get; set; }

    public ShapeType Type { get; set; }

    public double X { get; set; }

    public double Y { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    public double? EndX { get; set; }

    public double? EndY { get; set; }

    public string Fill { get; set; } = "#ffffff";

    public string Stroke { get; set; } = "#111827";

    public double StrokeWidth { get; set; }

    public string? Text { get; set; }

    public int? FontSize { get; set; }

    public int ZIndex { get; set; }

    public Guid? MediaId { get; set; }

    public string? ImageUrl { get; set; }

    public string? AltText { get; set; }

    public string? TemplateId { get; set; }

    public string? GeometryJson { get; set; }

    public double? RotationX { get; set; }

    public double? RotationY { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
