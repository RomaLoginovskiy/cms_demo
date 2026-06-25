using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Domain;
using Whiteboard.Infrastructure;

namespace Whiteboard.Tests;

public sealed class WhiteboardDbContextTests
{
    [Fact]
    [Trait("Category", "BoardApi")]
    public async Task Deleting_board_cascades_shapes()
    {
        await using var connection = await OpenConnectionAsync();
        await using var db = CreateContext(connection);
        await db.Database.EnsureCreatedAsync();

        var board = CreateBoardWithShape();
        db.Boards.Add(board);
        await db.SaveChangesAsync();

        db.Boards.Remove(board);
        await db.SaveChangesAsync();

        Assert.Equal(0, await db.Shapes.CountAsync());
    }

    [Fact]
    [Trait("Category", "BoardApi")]
    public async Task Shape_type_is_stored_as_string()
    {
        await using var connection = await OpenConnectionAsync();
        await using var db = CreateContext(connection);
        await db.Database.EnsureCreatedAsync();

        db.Boards.Add(CreateBoardWithShape());
        await db.SaveChangesAsync();

        Assert.Equal("Rectangle", ReadStoredShapeType(connection));
    }

    [Fact]
    [Trait("Category", "ImageShapes")]
    public async Task Image_shape_stores_cms_reference_fields()
    {
        await using var connection = await OpenConnectionAsync();
        await using var db = CreateContext(connection);
        await db.Database.EnsureCreatedAsync();

        var now = DateTimeOffset.UtcNow;
        var board = new Board { Id = Guid.NewGuid(), Name = "Images", CreatedAt = now, UpdatedAt = now };
        board.Shapes.Add(new Shape
        {
            Id = Guid.NewGuid(),
            BoardId = board.Id,
            Type = ShapeType.Image,
            X = 10,
            Y = 10,
            Width = 320,
            Height = 200,
            Fill = "#ffffff",
            Stroke = "#111827",
            StrokeWidth = 1,
            ZIndex = 1,
            MediaId = Guid.Parse("11111111-1111-4111-8111-111111111111"),
            ImageUrl = "http://localhost:8080/api/media/11111111-1111-4111-8111-111111111111/file",
            AltText = "CMS image",
            UpdatedAt = now
        });

        db.Boards.Add(board);
        await db.SaveChangesAsync();

        var saved = await db.Shapes.SingleAsync(shape => shape.Type == ShapeType.Image);
        Assert.Equal(board.Shapes[0].MediaId, saved.MediaId);
        Assert.Equal(board.Shapes[0].ImageUrl, saved.ImageUrl);
        Assert.Equal(board.Shapes[0].AltText, saved.AltText);
    }

    [Fact]
    [Trait("Category", "ComplexShapes")]
    public async Task Path_shape_stores_geometry_snapshot()
    {
        await using var connection = await OpenConnectionAsync();
        await using var db = CreateContext(connection);
        await db.Database.EnsureCreatedAsync();

        var now = DateTimeOffset.UtcNow;
        var board = new Board { Id = Guid.NewGuid(), Name = "Paths", CreatedAt = now, UpdatedAt = now };
        const string geometry = """{"version":1,"kind":"path","segments":[[[0,0],[1,1]]]}""";
        board.Shapes.Add(new Shape
        {
            Id = Guid.NewGuid(),
            BoardId = board.Id,
            Type = ShapeType.Path,
            TemplateId = "cross-small",
            GeometryJson = geometry,
            X = 0,
            Y = 0,
            Width = 100,
            Height = 100,
            Fill = "#ffffff",
            Stroke = "#111827",
            StrokeWidth = 2,
            ZIndex = 1,
            UpdatedAt = now
        });

        db.Boards.Add(board);
        await db.SaveChangesAsync();

        var saved = await db.Shapes.SingleAsync(shape => shape.Type == ShapeType.Path);
        Assert.Equal(geometry, saved.GeometryJson);
        Assert.Equal("cross-small", saved.TemplateId);
    }

    private static async Task<SqliteConnection> OpenConnectionAsync()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        return connection;
    }

    private static WhiteboardDbContext CreateContext(SqliteConnection connection)
    {
        var options = new DbContextOptionsBuilder<WhiteboardDbContext>()
            .UseSqlite(connection)
            .Options;

        return new WhiteboardDbContext(options);
    }

    private static Board CreateBoardWithShape()
    {
        var now = DateTimeOffset.UtcNow;
        var board = new Board { Id = Guid.NewGuid(), Name = "Test", CreatedAt = now, UpdatedAt = now };
        board.Shapes.Add(CreateRectangle(board.Id, now));
        return board;
    }

    private static Shape CreateRectangle(Guid boardId, DateTimeOffset now) =>
        new()
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Type = ShapeType.Rectangle,
            X = 10,
            Y = 10,
            Width = 100,
            Height = 80,
            Fill = "#ffffff",
            Stroke = "#111827",
            StrokeWidth = 2,
            ZIndex = 1,
            UpdatedAt = now
        };

    private static string? ReadStoredShapeType(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Type FROM Shapes LIMIT 1";
        return command.ExecuteScalar()?.ToString();
    }
}
