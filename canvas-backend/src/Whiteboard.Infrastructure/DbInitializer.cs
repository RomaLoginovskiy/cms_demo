using Microsoft.EntityFrameworkCore;
using Whiteboard.Domain;

namespace Whiteboard.Infrastructure;

public static class DbInitializer
{
    public static async Task SeedAsync(WhiteboardDbContext db, CancellationToken ct = default)
    {
        if (await db.Boards.AnyAsync(ct))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var board = CreateDemoBoard(now);

        db.Boards.Add(board);
        await db.SaveChangesAsync(ct);
    }

    private static Board CreateDemoBoard(DateTimeOffset now)
    {
        var boardId = Guid.NewGuid();

        return new Board
        {
            Id = boardId,
            Name = "Demo Board",
            CreatedAt = now,
            UpdatedAt = now,
            Shapes = CreateDemoShapes(boardId, now)
        };
    }

    private static List<Shape> CreateDemoShapes(Guid boardId, DateTimeOffset now) =>
    [
        CreateShape(boardId, ShapeType.Rectangle, 80, 80, 180, 120, "#dbeafe", 1, now),
        CreateSticky(boardId, now),
        CreateShape(boardId, ShapeType.Ellipse, 420, 110, 160, 120, "#dcfce7", 3, now)
    ];

    private static Shape CreateSticky(Guid boardId, DateTimeOffset now)
    {
        var sticky = CreateShape(boardId, ShapeType.Sticky, 290, 260, 220, 150, "#fef3c7", 2, now);
        sticky.Text = "Welcome";
        sticky.FontSize = 24;
        return sticky;
    }

    private static Shape CreateShape(
        Guid boardId,
        ShapeType type,
        double x,
        double y,
        double width,
        double height,
        string fill,
        int zIndex,
        DateTimeOffset now) =>
        new()
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Type = type,
            X = x,
            Y = y,
            Width = width,
            Height = height,
            Fill = fill,
            Stroke = "#111827",
            StrokeWidth = 2,
            ZIndex = zIndex,
            UpdatedAt = now
        };
}
