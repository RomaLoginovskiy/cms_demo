using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Domain;
using Whiteboard.Domain.Contracts;
using Whiteboard.Infrastructure;

namespace Whiteboard.Api;

public sealed class BoardHub(WhiteboardDbContext db, IBoardPresenceStore presenceStore) : Hub
{
    public async Task JoinBoard(Guid boardId, Guid userId, string displayName, string color)
    {
        var user = new UserDto(userId, displayName, color);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(boardId), Context.ConnectionAborted);

        var snapshot = presenceStore.Join(Context.ConnectionId, boardId, user);
        await Clients.Caller.SendAsync("PresenceSnapshot", snapshot, Context.ConnectionAborted);
        await Clients.Group(GroupName(boardId)).SendAsync("PresenceJoined", user, Context.ConnectionAborted);
    }

    public async Task LeaveBoard(Guid boardId)
    {
        var user = presenceStore.Leave(Context.ConnectionId, boardId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(boardId), Context.ConnectionAborted);

        if (user is not null)
        {
            await Clients.Group(GroupName(boardId)).SendAsync("PresenceLeft", user.UserId, Context.ConnectionAborted);
        }
    }

    public async Task CreateShape(Guid boardId, ShapeDto shape)
    {
        await EnsureBoardExistsAsync(boardId);
        ShapeGeometryValidator.ValidateForCreate(shape);

        var saved = CreateEntity(boardId, shape, DateTimeOffset.UtcNow);
        db.Shapes.Add(saved);
        await db.SaveChangesAsync(Context.ConnectionAborted);

        await Clients.Group(GroupName(boardId)).SendAsync("ShapeCreated", ToDto(saved), Context.ConnectionAborted);
    }

    public async Task UpdateShape(Guid boardId, ShapeDto shape)
    {
        var saved = await FindShapeAsync(boardId, shape.Id);
        CopyShape(shape, saved, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(Context.ConnectionAborted);

        await Clients.Group(GroupName(boardId)).SendAsync("ShapeUpdated", ToDto(saved), Context.ConnectionAborted);
    }

    public async Task DeleteShape(Guid boardId, Guid shapeId)
    {
        var shape = await FindShapeAsync(boardId, shapeId);
        db.Shapes.Remove(shape);
        await db.SaveChangesAsync(Context.ConnectionAborted);

        await Clients.Group(GroupName(boardId)).SendAsync("ShapeDeleted", shapeId, Context.ConnectionAborted);
    }

    public async Task MoveCursor(Guid boardId, double x, double y)
    {
        var user = FindCurrentUser(boardId);
        await Clients.Group(GroupName(boardId)).SendAsync("CursorMoved", user.UserId, x, y, Context.ConnectionAborted);
    }

    public async Task SetSelection(Guid boardId, Guid[] shapeIds)
    {
        var user = FindCurrentUser(boardId);
        await Clients.Group(GroupName(boardId)).SendAsync("SelectionChanged", user.UserId, shapeIds, Context.ConnectionAborted);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var presence in presenceStore.RemoveConnection(Context.ConnectionId))
        {
            await Clients.Group(GroupName(presence.BoardId))
                .SendAsync("PresenceLeft", presence.User.UserId, CancellationToken.None);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task EnsureBoardExistsAsync(Guid boardId)
    {
        if (!await db.Boards.AnyAsync(board => board.Id == boardId, Context.ConnectionAborted))
        {
            throw new HubException("Board not found.");
        }
    }

    private async Task<Shape> FindShapeAsync(Guid boardId, Guid shapeId)
    {
        var shape = await db.Shapes.SingleOrDefaultAsync(
            item => item.BoardId == boardId && item.Id == shapeId,
            Context.ConnectionAborted);

        return shape ?? throw new HubException("Shape not found.");
    }

    private UserDto FindCurrentUser(Guid boardId)
    {
        return presenceStore.FindUser(Context.ConnectionId, boardId)
            ?? throw new HubException("Connection has not joined this board.");
    }

    private static Shape CreateEntity(Guid boardId, ShapeDto dto, DateTimeOffset updatedAt)
    {
        var shape = new Shape
        {
            Id = dto.Id == Guid.Empty ? Guid.NewGuid() : dto.Id,
            BoardId = boardId
        };

        ApplyShapeFields(dto, shape, updatedAt);
        return shape;
    }

    private static void CopyShape(ShapeDto dto, Shape shape, DateTimeOffset updatedAt)
    {
        ApplyShapeFields(dto, shape, updatedAt, preserveGeometry: true);
    }

    private static void ApplyShapeFields(ShapeDto dto, Shape shape, DateTimeOffset updatedAt, bool preserveGeometry = false)
    {
        shape.Type = dto.Type;
        shape.X = dto.X;
        shape.Y = dto.Y;
        shape.Width = dto.Width;
        shape.Height = dto.Height;
        shape.EndX = dto.EndX;
        shape.EndY = dto.EndY;
        shape.Fill = dto.Fill;
        shape.Stroke = dto.Stroke;
        shape.StrokeWidth = dto.StrokeWidth;
        shape.Text = dto.Text;
        shape.FontSize = dto.FontSize;
        shape.ZIndex = dto.ZIndex;
        shape.MediaId = dto.MediaId;
        shape.ImageUrl = dto.ImageUrl;
        shape.AltText = dto.AltText;
        shape.TemplateId = dto.TemplateId ?? shape.TemplateId;

        if (!preserveGeometry || dto.GeometryJson is not null)
        {
            if (dto.GeometryJson is not null)
            {
                shape.GeometryJson = dto.GeometryJson;
            }
        }

        if (dto.RotationX.HasValue)
        {
            shape.RotationX = dto.RotationX;
        }

        if (dto.RotationY.HasValue)
        {
            shape.RotationY = dto.RotationY;
        }

        shape.UpdatedAt = updatedAt;
    }

    private static ShapeDto ToDto(Shape shape) =>
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

    private static string GroupName(Guid boardId) => boardId.ToString("D");
}
