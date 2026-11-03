using System.Text.Json;
using DemoCms.Agent.Cms;
using DemoCms.Agent.Tools;
using DemoCms.Core.DTOs;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using Xunit;

namespace DemoCms.Agent.Tests;

public sealed class SizeFormatterTests
{
    [Theory]
    [InlineData(0, "0 Bytes")]
    [InlineData(1023, "1023 Bytes")]
    [InlineData(1024, "1 KB")]
    [InlineData(1536, "1.5 KB")]
    [InlineData(1_048_576, "1 MB")]
    [InlineData(4_980_736, "4.75 MB")]
    [InlineData(1_065_467, "1.02 MB")]
    [InlineData(73_400_320, "70 MB")]
    [InlineData(5_368_709_120, "5 GB")]
    public void Format_MatchesTheCmsUi(long bytes, string expected)
    {
        Assert.Equal(expected, SizeFormatter.Format(bytes));
    }
}

public sealed class PeriodResolverTests
{
    private readonly PeriodResolver _resolver = new(new FixedTimeProvider());

    [Theory]
    [InlineData("today", "2026-11-02T00:00:00Z", "2026-11-02T10:00:00Z")]
    [InlineData("yesterday", "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z")]
    [InlineData("this_week", "2026-11-02T00:00:00Z", "2026-11-02T10:00:00Z")]
    [InlineData("last_week", "2026-10-26T00:00:00Z", "2026-11-02T00:00:00Z")]
    [InlineData("last_7_days", "2026-10-26T10:00:00Z", "2026-11-02T10:00:00Z")]
    [InlineData("this_month", "2026-11-01T00:00:00Z", "2026-11-02T10:00:00Z")]
    [InlineData("last_month", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")]
    [InlineData("this_year", "2026-01-01T00:00:00Z", "2026-11-02T10:00:00Z")]
    public void Resolve_NamedPeriods(string name, string from, string to)
    {
        var (period, error) = _resolver.Resolve(name, null, null);

        Assert.Null(error);
        Assert.Equal(DateTimeOffset.Parse(from), period!.From);
        Assert.Equal(DateTimeOffset.Parse(to), period.To);
    }

    [Fact]
    public void Resolve_DefaultsToAllTime()
    {
        var (period, _) = _resolver.Resolve(null, null, null);

        Assert.Equal("all_time", period!.Name);
        Assert.Null(period.From);
        Assert.Null(period.To);
    }

    [Fact]
    public void Resolve_DatesWithoutCustomBecomeCustom()
    {
        var (period, _) = _resolver.Resolve(null, "2026-10-01", null);

        Assert.Equal("custom", period!.Name);
        Assert.Equal(new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero), period.From);
        Assert.Equal(FixedTimeProvider.Monday, period.To);
    }

    [Fact]
    public void Resolve_NamedPeriodIgnoresDates()
    {
        // Schema-guided decoding fills every field, so "all_time" arrives with invented dates.
        var (period, error) = _resolver.Resolve("all_time", "2026-11-02", "2026-11-02");

        Assert.Null(error);
        Assert.Equal("all_time", period!.Name);
        Assert.Null(period.From);
    }

    [Theory]
    [InlineData("fortnight", null, null)]
    [InlineData("custom", null, null)]
    [InlineData("custom", "soon", null)]
    [InlineData("custom", "2026-11-02", "2026-11-01")]
    public void Resolve_RejectsInvalidInput(string name, string? from, string? to)
    {
        var (period, error) = _resolver.Resolve(name, from, to);

        Assert.Null(period);
        Assert.Equal("invalid_argument", JsonSerializer.SerializeToElement(error).GetProperty("error").GetString());
    }
}

public sealed class MediaToolsetTests
{
    private readonly FakeCmsApiClient _cms = new();

    private IList<AITool> Tools(int maxChars = 6000) =>
        new MediaToolset(_cms, new PeriodResolver(new FixedTimeProvider()), Options.Create(new AgentOptions { ToolResultMaxChars = maxChars }))
            .CreateTools();

    private async Task<JsonElement> InvokeAsync(string tool, object arguments, int maxChars = 6000)
    {
        var function = (AIFunction)Tools(maxChars).Single(t => t.Name == tool);
        var args = JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(arguments))!;
        var result = await function.InvokeAsync(new AIFunctionArguments(args));
        return Assert.IsType<JsonElement>(result);
    }

    [Fact]
    public void Tools_HaveSpecNamesAndValidSchemas()
    {
        var tools = Tools().Cast<AIFunction>().ToList();

        Assert.Equal(new[] { "search_media", "get_media_details", "get_media_stats", "list_tags" }, tools.Select(t => t.Name));
        Assert.All(tools, t => Assert.Equal("object", t.JsonSchema.GetProperty("type").GetString()));
        var periods = tools[0].JsonSchema.GetProperty("properties").GetProperty("period").GetProperty("enum");
        Assert.Contains("last_week", periods.EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task SearchMedia_MapsArgumentsToTheSearchEndpoint()
    {
        _cms.SearchResult = new PagedResult<MediaDto>
        {
            Total = 37,
            Items = { new MediaDto { Id = Guid.NewGuid(), FileName = "alps.jpg", Title = "", ContentType = "image/jpeg", Size = 4_980_736 } }
        };

        var result = await InvokeAsync("search_media", new
        {
            sortBy = "Largest",
            limit = "50",
            contentType = "image",
            tags = "nature, mountains",
            matchAllTags = true,
            period = "last_week"
        });

        var query = Assert.Single(_cms.Calls).Query;
        Assert.Equal("size_desc", query["sort"]);
        Assert.Equal("20", query["pageSize"]);
        Assert.Equal("image", query["contentType"]);
        Assert.Equal("nature,mountains", query["tags"]);
        Assert.Equal("all", query["tagMatch"]);
        Assert.Equal("2026-10-26T00:00:00.0000000+00:00", query["from"]);
        Assert.Equal("2026-11-02T00:00:00.0000000+00:00", query["to"]);

        Assert.Equal(37, result.GetProperty("total").GetInt32());
        var item = result.GetProperty("items")[0];
        Assert.Equal("alps.jpg", item.GetProperty("title").GetString());
        Assert.Equal("4.75 MB", item.GetProperty("sizeHuman").GetString());
        Assert.Equal("last_week", result.GetProperty("period").GetProperty("name").GetString());
    }

    [Theory]
    [InlineData("images", "image")]
    [InlineData("JPG", "image/jpeg")]
    [InlineData(".csv", "text/csv")]
    [InlineData("image/png", "image/png")]
    [InlineData("all", null)]
    [InlineData("", null)]
    public async Task SearchMedia_NormalisesContentTypesModelsWrite(string input, string? expected)
    {
        await InvokeAsync("search_media", new { contentType = input });

        Assert.Equal(expected, Assert.Single(_cms.Calls).Query["contentType"]);
    }

    [Fact]
    public async Task SearchMedia_UnknownEnumIsReportedToTheModel()
    {
        var result = await InvokeAsync("search_media", new { sortBy = "biggest" });

        Assert.Equal("invalid_argument", result.GetProperty("error").GetString());
        Assert.Equal("sortBy", result.GetProperty("field").GetString());
        Assert.Empty(_cms.Calls);
    }

    [Fact]
    public async Task SearchMedia_CapsResultSize()
    {
        for (var i = 0; i < 20; i++)
        {
            _cms.SearchResult.Items.Add(new MediaDto { Id = Guid.NewGuid(), FileName = $"f{i}.txt", ContentType = "text/plain", Description = new string('x', 300) });
        }
        _cms.SearchResult.Total = 20;

        var result = await InvokeAsync("search_media", new { limit = 20 }, maxChars: 2000);

        Assert.True(result.GetRawText().Length <= 2000);
        Assert.True(result.GetProperty("truncated").GetBoolean());
        Assert.Equal(20, result.GetProperty("total").GetInt32());
        Assert.True(result.GetProperty("returned").GetInt32() < 20);
    }

    [Fact]
    public async Task GetMediaDetails_ValidatesIdAndReportsMissingItems()
    {
        var invalid = await InvokeAsync("get_media_details", new { id = "sunset.jpg" });
        var missing = await InvokeAsync("get_media_details", new { id = Guid.NewGuid() });

        Assert.Equal("invalid_argument", invalid.GetProperty("error").GetString());
        Assert.Equal("not_found", missing.GetProperty("error").GetString());
    }

    [Fact]
    public async Task GetMediaStats_AddsHumanSizesAndPeriod()
    {
        _cms.StatsResult = new MediaStatsDto
        {
            GroupBy = "contentType",
            Totals = new MediaStatsTotalsDto { Count = 42, TotalBytes = 73_400_320, AverageBytes = 1_747_626, MinBytes = 10_240, MaxBytes = 4_980_736 },
            Groups = { new MediaStatsGroupDto { Key = "image/png", Count = 40, TotalBytes = 1_048_576 } }
        };

        var result = await InvokeAsync("get_media_stats", new { groupBy = "contentType", top = 99, period = "this_month" });

        var query = Assert.Single(_cms.Calls).Query;
        Assert.Equal("contentType", query["groupBy"]);
        Assert.Equal("20", query["top"]);
        var totals = result.GetProperty("totals");
        Assert.Equal(42, totals.GetProperty("count").GetInt32());
        Assert.Equal("70 MB", totals.GetProperty("totalHuman").GetString());
        Assert.Equal("1 MB", result.GetProperty("groups")[0].GetProperty("totalHuman").GetString());
        Assert.Equal("this_month", result.GetProperty("period").GetProperty("name").GetString());
    }

    [Fact]
    public async Task ListTags_UsesTagStats()
    {
        _cms.StatsResult = new MediaStatsDto { GroupBy = "tag", Groups = { new MediaStatsGroupDto { Key = "nature", Count = 12 } } };

        var result = await InvokeAsync("list_tags", new { });

        Assert.Equal("tag", _cms.Calls[0].Query["groupBy"]);
        Assert.Equal("nature", result.GetProperty("tags")[0].GetProperty("name").GetString());
        Assert.Equal(12, result.GetProperty("tags")[0].GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task CmsRejection_BecomesToolError()
    {
        _cms.Throw = new CmsBadRequestException(new Dictionary<string, string[]> { ["contentType"] = new[] { "bad" } });

        var result = await InvokeAsync("get_media_stats", new { contentType = "image png" });

        Assert.Equal("invalid_argument", result.GetProperty("error").GetString());
    }

    [Fact]
    public async Task CmsOutage_IsThrown()
    {
        _cms.Throw = new CmsUnavailableException("down");

        await Assert.ThrowsAsync<CmsUnavailableException>(() => InvokeAsync("list_tags", new { }));
    }
}
