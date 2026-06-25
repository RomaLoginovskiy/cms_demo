using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Whiteboard.Domain;
using Whiteboard.Domain.Contracts;
using Whiteboard.Infrastructure;

namespace Whiteboard.Tests;

public sealed class BoardHubTests
{
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(5);

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task JoinBoard_sends_presence_snapshot_and_joined_event()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var connection = CreateConnection(factory);
        var snapshot = CreateTask<UserDto[]>();
        var joined = CreateTask<UserDto>();
        var userId = Guid.NewGuid();

        connection.On<UserDto[]>("PresenceSnapshot", snapshot.SetResult);
        connection.On<UserDto>("PresenceJoined", joined.SetResult);

        await connection.StartAsync();
        await connection.InvokeAsync("JoinBoard", boardId, userId, "Ada", "#2563eb");

        Assert.Equal(userId, (await WaitForAsync(snapshot.Task)).Single().UserId);
        Assert.Equal("Ada", (await WaitForAsync(joined.Task)).DisplayName);
    }

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task LeaveBoard_notifies_remaining_group_members()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var observer = CreateConnection(factory);
        await using var leaver = CreateConnection(factory);
        var left = CreateTask<Guid>();
        var leaverId = Guid.NewGuid();

        observer.On<Guid>("PresenceLeft", left.SetResult);

        await observer.StartAsync();
        await leaver.StartAsync();
        await observer.InvokeAsync("JoinBoard", boardId, Guid.NewGuid(), "Observer", "#111827");
        await leaver.InvokeAsync("JoinBoard", boardId, leaverId, "Leaver", "#ef4444");
        await leaver.InvokeAsync("LeaveBoard", boardId);

        Assert.Equal(leaverId, await WaitForAsync(left.Task));
    }

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task Shape_methods_persist_and_echo_group_events()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var connection = CreateConnection(factory);
        var shapeId = Guid.NewGuid();

        await JoinBoardAsync(connection, boardId);
        var created = await CreateShapeAsync(connection, boardId, shapeId);
        var updated = await UpdateShapeAsync(connection, boardId, created with { X = 42, Y = 24 });
        await AssertShapePositionAsync(factory, shapeId, 42, 24);
        var deletedShapeId = await DeleteShapeAsync(connection, boardId, shapeId);

        Assert.Equal(shapeId, created.Id);
        Assert.True(created.UpdatedAt > DateTimeOffset.UnixEpoch);
        Assert.Equal(42, updated.X);
        Assert.Equal(shapeId, deletedShapeId);
        await AssertShapeDeletedAsync(factory, shapeId);
    }

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task Cursor_and_selection_events_broadcast_without_persisting()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var connection = CreateConnection(factory);
        var userId = Guid.NewGuid();
        var moved = CreateTask<(Guid UserId, double X, double Y)>();
        var selected = CreateTask<(Guid UserId, Guid[] ShapeIds)>();

        connection.On<Guid, double, double>("CursorMoved", (id, x, y) => moved.SetResult((id, x, y)));
        connection.On<Guid, Guid[]>("SelectionChanged", (id, ids) => selected.SetResult((id, ids)));

        var shapeCount = await CountShapesAsync(factory);
        await connection.StartAsync();
        await connection.InvokeAsync("JoinBoard", boardId, userId, "Cursor", "#22c55e");
        await connection.InvokeAsync("MoveCursor", boardId, 12.5, 9.5);
        await connection.InvokeAsync("SetSelection", boardId, new[] { Guid.NewGuid() });

        Assert.Equal(userId, (await WaitForAsync(moved.Task)).UserId);
        Assert.Single((await WaitForAsync(selected.Task)).ShapeIds);
        Assert.Equal(shapeCount, await CountShapesAsync(factory));
    }

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task Path_create_requires_geometry_and_update_preserves_it()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var connection = CreateConnection(factory);
        var shapeId = Guid.NewGuid();
        const string geometry = """{"version":1,"kind":"path","segments":[[[0,0],[1,0]],[[0,0],[0,1]]]}""";

        await JoinBoardAsync(connection, boardId);
        var created = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeCreated", created.SetResult);
        await connection.InvokeAsync(
            "CreateShape",
            boardId,
            CreateRectangle(boardId, shapeId) with
            {
                Type = ShapeType.Path,
                TemplateId = "cross-small",
                GeometryJson = geometry
            });

        var saved = await WaitForAsync(created.Task);
        Assert.Equal(geometry, saved.GeometryJson);

        var updated = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeUpdated", updated.SetResult);
        await connection.InvokeAsync(
            "UpdateShape",
            boardId,
            saved with { X = 99, GeometryJson = null });

        var echoed = await WaitForAsync(updated.Task);
        Assert.Equal(99, echoed.X);
        Assert.Equal(geometry, echoed.GeometryJson);
    }

    [Fact]
    [Trait("Category", "Realtime")]
    public async Task Mesh3D_rotation_updates_without_resending_geometry()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        var boardId = await ReadSeededBoardIdAsync(factory);
        await using var connection = CreateConnection(factory);
        var shapeId = Guid.NewGuid();
        const string geometry = """{"version":1,"kind":"mesh3d","vertices":[[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5]],"faces":[[0,1,2]]}""";

        await JoinBoardAsync(connection, boardId);
        var created = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeCreated", created.SetResult);
        await connection.InvokeAsync(
            "CreateShape",
            boardId,
            CreateRectangle(boardId, shapeId) with
            {
                Type = ShapeType.Mesh3D,
                TemplateId = "cube",
                GeometryJson = geometry,
                RotationX = 0,
                RotationY = 0
            });

        var saved = await WaitForAsync(created.Task);

        var updated = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeUpdated", updated.SetResult);
        await connection.InvokeAsync(
            "UpdateShape",
            boardId,
            saved with { RotationX = 1.2, RotationY = 0.8, GeometryJson = null });

        var echoed = await WaitForAsync(updated.Task);
        Assert.Equal(1.2, echoed.RotationX);
        Assert.Equal(0.8, echoed.RotationY);
        Assert.Equal(geometry, echoed.GeometryJson);
    }

    private static HubConnection CreateConnection(TestWhiteboardApplicationFactory factory) =>
        new HubConnectionBuilder()
            .WithUrl("http://localhost/hubs/board", options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .AddJsonProtocol(options => options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()))
            .Build();

    private static async Task JoinBoardAsync(HubConnection connection, Guid boardId)
    {
        await connection.StartAsync();
        await connection.InvokeAsync("JoinBoard", boardId, Guid.NewGuid(), "Tester", "#111827");
    }

    private static async Task<ShapeDto> CreateShapeAsync(HubConnection connection, Guid boardId, Guid shapeId)
    {
        var created = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeCreated", created.SetResult);
        await connection.InvokeAsync("CreateShape", boardId, CreateRectangle(boardId, shapeId));
        return await WaitForAsync(created.Task);
    }

    private static async Task<ShapeDto> UpdateShapeAsync(HubConnection connection, Guid boardId, ShapeDto shape)
    {
        var updated = CreateTask<ShapeDto>();
        connection.On<ShapeDto>("ShapeUpdated", updated.SetResult);
        await connection.InvokeAsync("UpdateShape", boardId, shape);
        return await WaitForAsync(updated.Task);
    }

    private static async Task<Guid> DeleteShapeAsync(HubConnection connection, Guid boardId, Guid shapeId)
    {
        var deleted = CreateTask<Guid>();
        connection.On<Guid>("ShapeDeleted", deleted.SetResult);
        await connection.InvokeAsync("DeleteShape", boardId, shapeId);
        return await WaitForAsync(deleted.Task);
    }

    private static ShapeDto CreateRectangle(Guid boardId, Guid shapeId) =>
        new(
            shapeId,
            boardId,
            ShapeType.Rectangle,
            10,
            15,
            100,
            80,
            null,
            null,
            "#ffffff",
            "#111827",
            2,
            null,
            null,
            1,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            DateTimeOffset.UnixEpoch);

    private static async Task<Guid> ReadSeededBoardIdAsync(TestWhiteboardApplicationFactory factory)
    {
        using var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WhiteboardDbContext>();
        var boards = await db.Boards.AsNoTracking().ToListAsync();
        return Assert.Single(boards).Id;
    }

    private static async Task AssertShapeDeletedAsync(TestWhiteboardApplicationFactory factory, Guid shapeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WhiteboardDbContext>();
        Assert.False(await db.Shapes.AnyAsync(shape => shape.Id == shapeId));
    }

    private static async Task AssertShapePositionAsync(
        TestWhiteboardApplicationFactory factory,
        Guid shapeId,
        double x,
        double y)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WhiteboardDbContext>();
        var saved = await db.Shapes.AsNoTracking().SingleAsync(shape => shape.Id == shapeId);
        Assert.Equal((x, y), (saved.X, saved.Y));
    }

    private static async Task<int> CountShapesAsync(TestWhiteboardApplicationFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WhiteboardDbContext>();
        return await db.Shapes.CountAsync();
    }

    private static TaskCompletionSource<T> CreateTask<T>() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static async Task<T> WaitForAsync<T>(Task<T> task) =>
        await task.WaitAsync(EventTimeout);

}
