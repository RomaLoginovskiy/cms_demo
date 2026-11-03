using DemoCms.Api.Queries;
using DemoCms.Core.DTOs;
using Xunit;

namespace DemoCms.Infrastructure.Tests;

public sealed class MediaQueryParserTests
{
    [Fact]
    public void ParseSearch_AppliesDefaults()
    {
        var errors = new Dictionary<string, string[]>();

        var query = MediaQueryParser.ParseSearch(new MediaSearchParameters(), errors);

        Assert.Empty(errors);
        Assert.Null(query.Text);
        Assert.Empty(query.Tags);
        Assert.Equal(TagMatch.Any, query.TagMatch);
        Assert.Equal(MediaSort.UploadedAtDesc, query.Sort);
        Assert.Equal(1, query.Page);
        Assert.Equal(20, query.PageSize);
    }

    [Fact]
    public void ParseSearch_NormalisesTagsAndContentType()
    {
        var errors = new Dictionary<string, string[]>();

        var query = MediaQueryParser.ParseSearch(new MediaSearchParameters
        {
            Q = "  sunset ",
            Tags = " Nature, nature ,Mountains,, ",
            TagMatch = "ALL",
            ContentType = "Image/*",
            Sort = "SIZE_DESC"
        }, errors);

        Assert.Empty(errors);
        Assert.Equal("sunset", query.Text);
        Assert.Equal(new[] { "nature", "mountains" }, query.Tags);
        Assert.Equal(TagMatch.All, query.TagMatch);
        Assert.Equal("image", query.ContentType);
        Assert.Equal(MediaSort.SizeDesc, query.Sort);
    }

    [Theory]
    [InlineData("image/png", "image/png")]
    [InlineData("TEXT", "text")]
    [InlineData("text/", "text")]
    [InlineData("application/vnd.ms-excel", "application/vnd.ms-excel")]
    public void ParseSearch_AcceptsContentTypes(string input, string expected)
    {
        var errors = new Dictionary<string, string[]>();

        var query = MediaQueryParser.ParseSearch(new MediaSearchParameters { ContentType = input }, errors);

        Assert.Empty(errors);
        Assert.Equal(expected, query.ContentType);
    }

    [Fact]
    public void ParseSearch_DatesWithoutOffsetAreUtc()
    {
        var errors = new Dictionary<string, string[]>();

        var query = MediaQueryParser.ParseSearch(new MediaSearchParameters
        {
            From = "2026-11-01",
            To = "2026-11-02T12:00:00+02:00"
        }, errors);

        Assert.Empty(errors);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), query.From);
        Assert.Equal(new DateTimeOffset(2026, 11, 2, 10, 0, 0, TimeSpan.Zero), query.To);
    }

    [Theory]
    [InlineData("sort", "newest")]
    [InlineData("tagMatch", "7")]
    [InlineData("contentType", "image png")]
    [InlineData("from", "yesterday")]
    [InlineData("tags", "a,b,c,d,e,f")]
    [InlineData("pageSize", "0")]
    [InlineData("pageSize", "101")]
    [InlineData("page", "0")]
    public void ParseSearch_RejectsInvalidValues(string field, string value)
    {
        var parameters = new MediaSearchParameters();
        switch (field)
        {
            case "sort": parameters.Sort = value; break;
            case "tagMatch": parameters.TagMatch = value; break;
            case "contentType": parameters.ContentType = value; break;
            case "from": parameters.From = value; break;
            case "tags": parameters.Tags = value; break;
            case "pageSize": parameters.PageSize = int.Parse(value); break;
            case "page": parameters.Page = int.Parse(value); break;
        }
        var errors = new Dictionary<string, string[]>();

        MediaQueryParser.ParseSearch(parameters, errors);

        Assert.True(errors.ContainsKey(field), $"expected an error for '{field}'");
    }

    [Fact]
    public void ParseSearch_RejectsFromNotBeforeTo()
    {
        var errors = new Dictionary<string, string[]>();

        MediaQueryParser.ParseSearch(new MediaSearchParameters { From = "2026-11-02", To = "2026-11-02" }, errors);

        Assert.True(errors.ContainsKey("to"));
    }

    [Fact]
    public void ParseStats_ParsesGroupByCaseInsensitively()
    {
        var errors = new Dictionary<string, string[]>();

        var query = MediaQueryParser.ParseStats(new MediaStatsParameters { GroupBy = "ContentType", Top = 5 }, errors);

        Assert.Empty(errors);
        Assert.Equal(MediaStatsGroupBy.ContentType, query.GroupBy);
        Assert.Equal(5, query.Top);
    }

    [Theory]
    [InlineData("hour", null)]
    [InlineData(null, 0)]
    [InlineData(null, 101)]
    public void ParseStats_RejectsInvalidGroupByAndTop(string? groupBy, int? top)
    {
        var errors = new Dictionary<string, string[]>();

        MediaQueryParser.ParseStats(new MediaStatsParameters { GroupBy = groupBy, Top = top }, errors);

        Assert.True(errors.ContainsKey(groupBy is null ? "top" : "groupBy"));
    }
}
