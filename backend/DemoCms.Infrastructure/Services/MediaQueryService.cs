using System.Diagnostics;
using System.Globalization;
using DemoCms.Core.DTOs;
using DemoCms.Core.Interfaces;
using DemoCms.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace DemoCms.Infrastructure.Services;

/// <summary>
/// Search and statistics over media metadata.
/// Text, tag and content-type filters run in the database. Date filters, ordering, paging and aggregation run
/// in memory because the SQLite provider cannot translate DateTimeOffset comparisons or ordering
/// (the same reason <see cref="MediaService.GetAllAsync"/> sorts in memory). Fine up to tens of thousands of rows.
/// </summary>
public class MediaQueryService : IMediaQueryService
{
    public const int MaxTimeBuckets = 366;

    private static readonly ActivitySource ActivitySource = new("demo-cms-api");

    private readonly MediaDbContext _context;
    private readonly TimeProvider _timeProvider;

    public MediaQueryService(MediaDbContext context, TimeProvider timeProvider)
    {
        _context = context;
        _timeProvider = timeProvider;
    }

    public async Task<PagedResult<MediaDto>> SearchAsync(MediaSearchQuery query, CancellationToken cancellationToken = default)
    {
        using var activity = ActivitySource.StartActivity("media.search");

        var rows = await LoadRowsAsync(query, includeDescription: true, cancellationToken);
        var ordered = Sort(rows, query.Sort).ToList();
        var items = ordered
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(row => row.ToDto())
            .ToList();

        activity?.SetTag("search.sort", query.Sort.ToString());
        activity?.SetTag("result.total", ordered.Count);
        activity?.SetTag("result.returned", items.Count);

        return new PagedResult<MediaDto>
        {
            Items = items,
            Total = ordered.Count,
            Page = query.Page,
            PageSize = query.PageSize
        };
    }

    public async Task<MediaStatsDto> GetStatsAsync(MediaStatsQuery query, CancellationToken cancellationToken = default)
    {
        using var activity = ActivitySource.StartActivity("media.stats");

        var now = _timeProvider.GetUtcNow();
        var rows = await LoadRowsAsync(query, includeDescription: false, cancellationToken);

        var result = new MediaStatsDto
        {
            GeneratedAt = now,
            Filters = new MediaStatsFiltersDto
            {
                From = query.From,
                To = query.To,
                Tags = query.Tags.ToList(),
                TagMatch = query.TagMatch == TagMatch.All ? "all" : "any",
                ContentType = query.ContentType
            },
            Totals = BuildTotals(rows),
            GroupBy = ToContractName(query.GroupBy)
        };

        switch (query.GroupBy)
        {
            case MediaStatsGroupBy.ContentType:
                ApplyTop(result, GroupByKey(rows, row => new[] { row.ContentType.ToLowerInvariant() }), query.Top);
                break;
            case MediaStatsGroupBy.Tag:
                ApplyTop(result, GroupByKey(rows, row => row.Tags), query.Top);
                break;
            case MediaStatsGroupBy.Day:
            case MediaStatsGroupBy.Week:
            case MediaStatsGroupBy.Month:
                result.Groups = BuildTimeBuckets(rows, query, now);
                break;
        }

        activity?.SetTag("stats.group_by", result.GroupBy);
        activity?.SetTag("result.count", result.Totals.Count);
        activity?.SetTag("result.groups", result.Groups.Count);

        return result;
    }

    private async Task<List<MediaRow>> LoadRowsAsync(MediaFilter filter, bool includeDescription, CancellationToken cancellationToken)
    {
        var media = _context.Media.AsNoTracking();

        if (!string.IsNullOrEmpty(filter.Text))
        {
            var text = filter.Text.ToLowerInvariant();
            media = media.Where(m =>
                m.FileName.ToLower().Contains(text)
                || (m.Title != null && m.Title.ToLower().Contains(text))
                || (m.Description != null && m.Description.ToLower().Contains(text)));
        }

        if (filter.Tags.Count > 0)
        {
            if (filter.TagMatch == TagMatch.All)
            {
                foreach (var tag in filter.Tags)
                {
                    media = media.Where(m => m.MediaTags.Any(mt => mt.Tag.Name.ToLower() == tag));
                }
            }
            else
            {
                var tags = filter.Tags.ToList();
                media = media.Where(m => m.MediaTags.Any(mt => tags.Contains(mt.Tag.Name.ToLower())));
            }
        }

        if (!string.IsNullOrEmpty(filter.ContentType))
        {
            var contentType = filter.ContentType;
            if (contentType.Contains('/'))
            {
                media = media.Where(m => m.ContentType.ToLower() == contentType);
            }
            else
            {
                var prefix = contentType + "/";
                media = media.Where(m => m.ContentType.ToLower().StartsWith(prefix));
            }
        }

        var rows = await media
            .Select(m => new MediaRow(
                m.Id,
                m.FileName,
                m.Title,
                includeDescription ? m.Description : null,
                m.ContentType,
                m.Size,
                m.UploadedAt,
                m.MediaTags.Select(mt => mt.Tag.Name).ToList()))
            .ToListAsync(cancellationToken);

        return rows
            .Where(row => filter.From is null || row.UploadedAt >= filter.From.Value)
            .Where(row => filter.To is null || row.UploadedAt < filter.To.Value)
            .ToList();
    }

    private static IEnumerable<MediaRow> Sort(IEnumerable<MediaRow> rows, MediaSort sort) => sort switch
    {
        MediaSort.UploadedAtAsc => rows.OrderBy(r => r.UploadedAt).ThenBy(r => r.Id),
        MediaSort.SizeDesc => rows.OrderByDescending(r => r.Size).ThenBy(r => r.Id),
        MediaSort.SizeAsc => rows.OrderBy(r => r.Size).ThenBy(r => r.Id),
        MediaSort.TitleAsc => rows.OrderBy(r => r.DisplayTitle, StringComparer.OrdinalIgnoreCase).ThenBy(r => r.Id),
        _ => rows.OrderByDescending(r => r.UploadedAt).ThenBy(r => r.Id)
    };

    private static MediaStatsTotalsDto BuildTotals(IReadOnlyCollection<MediaRow> rows)
    {
        if (rows.Count == 0)
        {
            return new MediaStatsTotalsDto();
        }

        var totalBytes = rows.Sum(r => r.Size);
        var largest = rows.OrderByDescending(r => r.Size).ThenBy(r => r.Id).First();

        return new MediaStatsTotalsDto
        {
            Count = rows.Count,
            TotalBytes = totalBytes,
            AverageBytes = (long)Math.Round(totalBytes / (double)rows.Count, MidpointRounding.AwayFromZero),
            MinBytes = rows.Min(r => r.Size),
            MaxBytes = largest.Size,
            Largest = new MediaSizeRefDto { Id = largest.Id, Title = largest.DisplayTitle, Size = largest.Size },
            FirstUploadAt = rows.Min(r => r.UploadedAt),
            LastUploadAt = rows.Max(r => r.UploadedAt),
            UntaggedCount = rows.Count(r => r.Tags.Count == 0)
        };
    }

    /// <summary>Groups rows by one or more keys per row (a row with several tags counts once per tag).</summary>
    private static List<MediaStatsGroupDto> GroupByKey(IEnumerable<MediaRow> rows, Func<MediaRow, IEnumerable<string>> keys)
    {
        var groups = new Dictionary<string, MediaStatsGroupDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            foreach (var key in keys(row).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!groups.TryGetValue(key, out var group))
                {
                    group = new MediaStatsGroupDto { Key = key };
                    groups[key] = group;
                }

                group.Count++;
                group.TotalBytes += row.Size;
            }
        }

        return groups.Values
            .OrderByDescending(g => g.Count)
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static void ApplyTop(MediaStatsDto result, List<MediaStatsGroupDto> groups, int top)
    {
        result.Groups = groups.Take(top).ToList();
        result.GroupsTruncated = groups.Count > top;
    }

    /// <summary>
    /// UTC buckets covering the whole requested range, empty buckets included.
    /// Without <see cref="MediaFilter.From"/> the range starts at the first matching upload; without
    /// <see cref="MediaFilter.To"/> it ends now.
    /// </summary>
    private static List<MediaStatsGroupDto> BuildTimeBuckets(IReadOnlyCollection<MediaRow> rows, MediaStatsQuery query, DateTimeOffset now)
    {
        DateTime? rangeStart = query.From?.UtcDateTime ?? (rows.Count > 0 ? rows.Min(r => r.UploadedAt).UtcDateTime : null);
        if (rangeStart is null)
        {
            return new List<MediaStatsGroupDto>();
        }

        var rangeEnd = (query.To ?? now).UtcDateTime;
        var lastIncluded = rangeEnd > rangeStart.Value ? rangeEnd.AddTicks(-1) : rangeStart.Value;

        var buckets = new List<MediaStatsGroupDto>();
        var index = new Dictionary<string, MediaStatsGroupDto>();
        for (var start = BucketStart(rangeStart.Value, query.GroupBy); start <= lastIncluded; start = NextBucket(start, query.GroupBy))
        {
            if (buckets.Count == MaxTimeBuckets)
            {
                throw new InvalidMediaQueryException(
                    "groupBy",
                    $"The range needs more than {MaxTimeBuckets} {ToContractName(query.GroupBy)} buckets; use a coarser groupBy or a shorter range.");
            }

            var bucket = new MediaStatsGroupDto { Key = BucketKey(start, query.GroupBy) };
            buckets.Add(bucket);
            index[bucket.Key] = bucket;
        }

        foreach (var row in rows)
        {
            var key = BucketKey(BucketStart(row.UploadedAt.UtcDateTime, query.GroupBy), query.GroupBy);
            if (index.TryGetValue(key, out var bucket))
            {
                bucket.Count++;
                bucket.TotalBytes += row.Size;
            }
        }

        return buckets;
    }

    private static DateTime BucketStart(DateTime utc, MediaStatsGroupBy groupBy)
    {
        var day = new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Utc);
        return groupBy switch
        {
            MediaStatsGroupBy.Week => day.AddDays(-(((int)day.DayOfWeek + 6) % 7)),
            MediaStatsGroupBy.Month => new DateTime(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc),
            _ => day
        };
    }

    private static DateTime NextBucket(DateTime start, MediaStatsGroupBy groupBy) => groupBy switch
    {
        MediaStatsGroupBy.Week => start.AddDays(7),
        MediaStatsGroupBy.Month => start.AddMonths(1),
        _ => start.AddDays(1)
    };

    private static string BucketKey(DateTime start, MediaStatsGroupBy groupBy) => groupBy switch
    {
        MediaStatsGroupBy.Week => string.Create(
            CultureInfo.InvariantCulture,
            $"{ISOWeek.GetYear(start)}-W{ISOWeek.GetWeekOfYear(start):00}"),
        MediaStatsGroupBy.Month => start.ToString("yyyy-MM", CultureInfo.InvariantCulture),
        _ => start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
    };

    private static string ToContractName(MediaStatsGroupBy groupBy) => groupBy switch
    {
        MediaStatsGroupBy.ContentType => "contentType",
        MediaStatsGroupBy.Tag => "tag",
        MediaStatsGroupBy.Day => "day",
        MediaStatsGroupBy.Week => "week",
        MediaStatsGroupBy.Month => "month",
        _ => "none"
    };

    private sealed record MediaRow(
        Guid Id,
        string FileName,
        string? Title,
        string? Description,
        string ContentType,
        long Size,
        DateTimeOffset UploadedAt,
        List<string> Tags)
    {
        public string DisplayTitle => string.IsNullOrWhiteSpace(Title) ? FileName : Title;

        public MediaDto ToDto() => new()
        {
            Id = Id,
            FileName = FileName,
            Title = Title,
            Description = Description,
            ContentType = ContentType,
            Size = Size,
            UploadedAt = UploadedAt,
            Tags = Tags
        };
    }
}
