using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;
using Whiteboard.Domain;
using Whiteboard.Domain.Contracts;
using Whiteboard.Infrastructure;

namespace Whiteboard.Api;

public static class BoardEndpoints
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public static RouteGroupBuilder MapBoardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/boards");

        group.MapGet("/", ListBoardsAsync);
        group.MapPost("/", CreateBoardAsync);
        group.MapGet("/{id:guid}", GetBoardAsync);
        group.MapPatch("/{id:guid}", RenameBoardAsync);
        group.MapDelete("/{id:guid}", DeleteBoardAsync);

        return group;
    }

    private static async Task<IResult> ListBoardsAsync(WhiteboardDbContext db, CancellationToken ct)
    {
        var boards = await db.Boards
            .AsNoTracking()
            .OrderBy(board => board.Name)
            .Select(board => new BoardSummaryDto(board.Id, board.Name, board.UpdatedAt))
            .ToListAsync(ct);

        return Json(boards);
    }

    private static async Task<IResult> CreateBoardAsync(
        CreateBoardRequest request,
        WhiteboardDbContext db,
        CancellationToken ct)
    {
        var name = NormalizeName(request.Name);
        if (name is null)
        {
            return Results.BadRequest("Board name is required.");
        }

        var board = CreateBoard(name);
        db.Boards.Add(board);
        await db.SaveChangesAsync(ct);

        return Json(new BoardCreatedDto(board.Id, board.Name), StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetBoardAsync(Guid id, WhiteboardDbContext db, CancellationToken ct)
    {
        var board = await db.Boards
            .AsNoTracking()
            .Include(item => item.Shapes.OrderBy(shape => shape.ZIndex))
            .SingleOrDefaultAsync(item => item.Id == id, ct);

        return board is null ? Results.NotFound() : Json(ToDetailDto(board));
    }

    private static async Task<IResult> RenameBoardAsync(
        Guid id,
        UpdateBoardRequest request,
        WhiteboardDbContext db,
        CancellationToken ct)
    {
        var board = await db.Boards.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (board is null)
        {
            return Results.NotFound();
        }

        var name = NormalizeName(request.Name);
        if (name is null)
        {
            return Results.BadRequest("Board name is required.");
        }

        board.Name = name;
        board.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteBoardAsync(Guid id, WhiteboardDbContext db, CancellationToken ct)
    {
        var board = await db.Boards.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (board is null)
        {
            return Results.NotFound();
        }

        db.Boards.Remove(board);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static string? NormalizeName(string? name)
    {
        var normalized = name?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static Board CreateBoard(string name)
    {
        var now = DateTimeOffset.UtcNow;
        return new Board { Id = Guid.NewGuid(), Name = name, CreatedAt = now, UpdatedAt = now };
    }

    private static BoardDetailDto ToDetailDto(Board board) =>
        new(board.Id, board.Name, board.Shapes.Select(ToShapeDto).ToList());

    private static ShapeDto ToShapeDto(Shape shape) =>
        new(
            shape.Id,
            shape.BoardId,
            shape.Type,
            shape.X,
            shape.Y,
            shape.Width,
            shape.Height,
            shape.EndX,
            shape.EndY,
            shape.Fill,
            shape.Stroke,
            shape.StrokeWidth,
            shape.Text,
            shape.FontSize,
            shape.ZIndex,
            shape.MediaId,
            shape.ImageUrl,
            shape.AltText,
            shape.TemplateId,
            shape.GeometryJson,
            shape.RotationX,
            shape.RotationY,
            shape.UpdatedAt);

    private static IResult Json<T>(T value, int statusCode = StatusCodes.Status200OK) =>
        Results.Text(JsonSerializer.Serialize(value, SerializerOptions), "application/json", statusCode: statusCode);
}
