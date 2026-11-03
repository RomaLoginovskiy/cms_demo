using DemoCms.Core.DTOs;
using DemoCms.Infrastructure.Data;
using DemoCms.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace DemoCms.Infrastructure.Tests;

public sealed class MediaQueryServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly MediaDbContext _context;
    private readonly MediaQueryService _service;

    public MediaQueryServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _context = new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseSqlite(_connection).Options);
        _context.Database.EnsureCreated();
        MediaTestData.Seed(_context);
        _context.ChangeTracker.Clear();
        _service = new MediaQueryService(_context, new FixedTimeProvider(MediaTestData.Now));
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task Search_DefaultsToNewestFirstWithTotal()
    {
        var result = await _service.SearchAsync(new MediaSearchQuery());

        Assert.Equal(6, result.Total);
        Assert.Equal(MediaTestData.LogoId, result.Items[0].Id);
        Assert.Equal(MediaTestData.ArchiveId, result.Items[^1].Id);
    }

    [Fact]
    public async Task Search_TextMatchesTitleFileNameAndDescriptionCaseInsensitively()
    {
        var result = await _service.SearchAsync(new MediaSearchQuery { Text = "ALP" });

        Assert.Equal(new[] { MediaTestData.NotesId, MediaTestData.AlpsId }, result.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Search_TagsMatchAnyByDefaultAndAllOnRequest()
    {
        var any = await _service.SearchAsync(new MediaSearchQuery { Tags = new[] { "nature", "mountains" } });
        var all = await _service.SearchAsync(new MediaSearchQuery { Tags = new[] { "nature", "mountains" }, TagMatch = TagMatch.All });

        Assert.Equal(3, any.Total);
        Assert.Equal(MediaTestData.AlpsId, Assert.Single(all.Items).Id);
    }

    [Fact]
    public async Task Search_ContentTypeAcceptsFamilyOrExactType()
    {
        var family = await _service.SearchAsync(new MediaSearchQuery { ContentType = "image" });
        var exact = await _service.SearchAsync(new MediaSearchQuery { ContentType = "image/png" });

        Assert.Equal(4, family.Total);
        Assert.Equal(MediaTestData.BeachId, Assert.Single(exact.Items).Id);
    }

    [Fact]
    public async Task Search_PeriodIsHalfOpen()
    {
        var result = await _service.SearchAsync(new MediaSearchQuery
        {
            From = new DateTimeOffset(2026, 10, 26, 0, 0, 0, TimeSpan.Zero),
            To = new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero)
        });

        Assert.Equal(
            new[] { MediaTestData.ReportId, MediaTestData.BeachId, MediaTestData.AlpsId },
            result.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Search_SortsAndPages()
    {
        var bySize = await _service.SearchAsync(new MediaSearchQuery { Sort = MediaSort.SizeDesc, PageSize = 2, Page = 2 });
        var byTitle = await _service.SearchAsync(new MediaSearchQuery { Sort = MediaSort.TitleAsc });

        Assert.Equal(6, bySize.Total);
        Assert.Equal(new[] { MediaTestData.ArchiveId, MediaTestData.LogoId }, bySize.Items.Select(i => i.Id));
        Assert.Equal(
            new[] { "Alps panorama", "Archive photo", "Beach", "Logo", "Notes", "Report" },
            byTitle.Items.Select(i => i.Title));
    }

    [Fact]
    public async Task Search_ReturnsTagsAndDescription()
    {
        var result = await _service.SearchAsync(new MediaSearchQuery { Text = "notes" });

        var notes = Assert.Single(result.Items);
        Assert.Equal("Meeting notes about the alpine trip", notes.Description);
        Assert.Empty(notes.Tags);
    }

    [Fact]
    public async Task Stats_TotalsCoverWholeLibrary()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery());

        Assert.Equal(MediaTestData.Now, stats.GeneratedAt);
        Assert.Equal("none", stats.GroupBy);
        Assert.Empty(stats.Groups);
        Assert.Equal(6, stats.Totals.Count);
        Assert.Equal(MediaTestData.TotalBytes, stats.Totals.TotalBytes);
        Assert.Equal(1_065_467, stats.Totals.AverageBytes);
        Assert.Equal(2_048, stats.Totals.MinBytes);
        Assert.Equal(4_980_736, stats.Totals.MaxBytes);
        Assert.Equal("Alps panorama", stats.Totals.Largest!.Title);
        Assert.Equal(new DateTimeOffset(2026, 9, 15, 10, 0, 0, TimeSpan.Zero), stats.Totals.FirstUploadAt);
        Assert.Equal(new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero), stats.Totals.LastUploadAt);
        Assert.Equal(1, stats.Totals.UntaggedCount);
    }

    [Fact]
    public async Task Stats_EmptyResultHasZerosAndNulls()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery { Tags = new[] { "missing" }, GroupBy = MediaStatsGroupBy.Day });

        Assert.Equal(0, stats.Totals.Count);
        Assert.Equal(0, stats.Totals.TotalBytes);
        Assert.Null(stats.Totals.MaxBytes);
        Assert.Null(stats.Totals.Largest);
        Assert.Null(stats.Totals.FirstUploadAt);
        Assert.Empty(stats.Groups);
    }

    [Fact]
    public async Task Stats_GroupByTagCountsItemOncePerTag()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery { GroupBy = MediaStatsGroupBy.Tag });

        Assert.Equal(new[] { "nature", "brand", "finance", "mountains" }, stats.Groups.Select(g => g.Key));
        Assert.Equal(3, stats.Groups[0].Count);
        Assert.Equal(4_980_736 + 1_048_576 + 300_000, stats.Groups[0].TotalBytes);
        Assert.False(stats.GroupsTruncated);
    }

    [Fact]
    public async Task Stats_GroupByContentTypeAppliesTop()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery { GroupBy = MediaStatsGroupBy.ContentType, Top = 2 });

        Assert.Equal(new[] { "image/gif", "image/jpeg" }, stats.Groups.Select(g => g.Key));
        Assert.True(stats.GroupsTruncated);
    }

    [Fact]
    public async Task Stats_DayBucketsIncludeEmptyDays()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery
        {
            GroupBy = MediaStatsGroupBy.Day,
            From = new DateTimeOffset(2026, 10, 30, 0, 0, 0, TimeSpan.Zero),
            To = new DateTimeOffset(2026, 11, 2, 0, 0, 0, TimeSpan.Zero)
        });

        Assert.Equal(new[] { "2026-10-30", "2026-10-31", "2026-11-01" }, stats.Groups.Select(g => g.Key));
        Assert.Equal(new[] { 0, 1, 1 }, stats.Groups.Select(g => g.Count));
    }

    [Fact]
    public async Task Stats_WeekBucketsUseIsoWeeksStartingMonday()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery
        {
            GroupBy = MediaStatsGroupBy.Week,
            From = new DateTimeOffset(2026, 10, 26, 0, 0, 0, TimeSpan.Zero),
            To = new DateTimeOffset(2026, 11, 9, 0, 0, 0, TimeSpan.Zero)
        });

        Assert.Equal(new[] { "2026-W44", "2026-W45" }, stats.Groups.Select(g => g.Key));
        Assert.Equal(new[] { 4, 1 }, stats.Groups.Select(g => g.Count));
    }

    [Fact]
    public async Task Stats_WeekKeyUsesIsoYearAtYearEnd()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery
        {
            GroupBy = MediaStatsGroupBy.Week,
            From = new DateTimeOffset(2026, 12, 30, 0, 0, 0, TimeSpan.Zero),
            To = new DateTimeOffset(2027, 1, 3, 0, 0, 0, TimeSpan.Zero)
        });

        Assert.Equal("2026-W53", Assert.Single(stats.Groups).Key);
    }

    [Fact]
    public async Task Stats_MonthBucketsStartAtFirstUploadWithoutFrom()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery { GroupBy = MediaStatsGroupBy.Month });

        Assert.Equal(new[] { "2026-09", "2026-10", "2026-11" }, stats.Groups.Select(g => g.Key));
        Assert.Equal(new[] { 1, 3, 2 }, stats.Groups.Select(g => g.Count));
        Assert.Equal(MediaTestData.TotalBytes, stats.Groups.Sum(g => g.TotalBytes));
    }

    [Fact]
    public async Task Stats_RejectsMoreThanMaxTimeBuckets()
    {
        var query = new MediaStatsQuery
        {
            GroupBy = MediaStatsGroupBy.Day,
            From = new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero)
        };

        var ex = await Assert.ThrowsAsync<InvalidMediaQueryException>(() => _service.GetStatsAsync(query));
        Assert.Equal("groupBy", ex.Field);
    }

    [Fact]
    public async Task Stats_EchoesNormalisedFilters()
    {
        var stats = await _service.GetStatsAsync(new MediaStatsQuery
        {
            Tags = new[] { "nature" },
            TagMatch = TagMatch.All,
            ContentType = "image"
        });

        Assert.Equal(new[] { "nature" }, stats.Filters.Tags);
        Assert.Equal("all", stats.Filters.TagMatch);
        Assert.Equal("image", stats.Filters.ContentType);
        Assert.Equal(3, stats.Totals.Count);
    }
}
