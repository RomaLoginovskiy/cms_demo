using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Whiteboard.Domain.Contracts;

namespace Whiteboard.Tests;

public sealed class BoardApiTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    [Trait("Category", "BoardApi")]
    public async Task Seed_creates_demo_board_with_expected_shapes()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        using var client = factory.CreateClient();

        var boards = await ReadJsonAsync<List<BoardSummaryDto>>(await client.GetAsync("/api/boards"));
        var demoBoard = Assert.Single(boards!);

        var detail = await ReadJsonAsync<JsonElement>(await client.GetAsync($"/api/boards/{demoBoard.Id}"));
        var shapes = detail.GetProperty("shapes").EnumerateArray().ToList();

        Assert.Equal("Demo Board", demoBoard.Name);
        Assert.Contains(shapes, shape => HasType(shape, "Rectangle"));
        Assert.Contains(shapes, shape => HasStickyWelcome(shape));
        Assert.Contains(shapes, shape => HasType(shape, "Ellipse"));
    }

    [Fact]
    [Trait("Category", "BoardApi")]
    public async Task Board_crud_endpoints_create_read_rename_delete_board()
    {
        using var factory = new TestWhiteboardApplicationFactory();
        using var client = factory.CreateClient();

        var created = await CreateBoardAsync(client, "Planning Board");
        await AssertBoardNameAsync(client, created.Id, "Planning Board");

        var renameResponse = await client.PatchAsJsonAsync($"/api/boards/{created.Id}", new { name = "Renamed Board" });
        await AssertStatusCodeAsync(renameResponse, HttpStatusCode.NoContent);

        await AssertBoardNameAsync(client, created.Id, "Renamed Board");
        await DeleteBoardAsync(client, created.Id);

        var afterDelete = await client.GetAsync($"/api/boards/{created.Id}");
        await AssertStatusCodeAsync(afterDelete, HttpStatusCode.NotFound);
    }

    private static async Task<BoardCreatedDto> CreateBoardAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/boards", new { name });
        await AssertStatusCodeAsync(response, HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<BoardCreatedDto>(JsonOptions))!;
    }

    private static async Task AssertBoardNameAsync(HttpClient client, Guid id, string expectedName)
    {
        var detail = await ReadJsonAsync<JsonElement>(await client.GetAsync($"/api/boards/{id}"));
        Assert.Equal(expectedName, detail.GetProperty("name").GetString());
    }

    private static async Task DeleteBoardAsync(HttpClient client, Guid id)
    {
        var response = await client.DeleteAsync($"/api/boards/{id}");
        await AssertStatusCodeAsync(response, HttpStatusCode.NoContent);
    }

    private static bool HasType(JsonElement shape, string type) =>
        shape.GetProperty("type").GetString() == type;

    private static bool HasStickyWelcome(JsonElement shape) =>
        HasType(shape, "Sticky") && shape.GetProperty("text").GetString() == "Welcome";

    private static async Task<T?> ReadJsonAsync<T>(HttpResponseMessage response)
    {
        await AssertStatusCodeAsync(response, HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions);
    }

    private static async Task AssertStatusCodeAsync(HttpResponseMessage response, HttpStatusCode expected)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"Expected {expected}, got {response.StatusCode}: {body}");
    }
}
