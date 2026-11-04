namespace DemoCms.Core.DTOs;

public enum TagMatch
{
    Any,
    All
}

public enum MediaSort
{
    UploadedAtDesc,
    UploadedAtAsc,
    SizeDesc,
    SizeAsc,
    TitleAsc
}

public enum MediaStatsGroupBy
{
    None,
    ContentType,
    Tag,
    Day,
    Week,
    Month
}

/// <summary>
/// Filters shared by search and stats. Tags and content type are already normalised (trimmed, lower case);
/// <see cref="ContentType"/> is either a full MIME type ("image/png") or a family ("image").
/// </summary>
public class MediaFilter
{
    public string? Text { get; init; }
    public IReadOnlyList<string> Tags { get; init; } = Array.Empty<string>();
    public TagMatch TagMatch { get; init; } = TagMatch.Any;
    public string? ContentType { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public class MediaSearchQuery : MediaFilter
{
    public MediaSort Sort { get; init; } = MediaSort.UploadedAtDesc;
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}

public class MediaStatsQuery : MediaFilter
{
    public MediaStatsGroupBy GroupBy { get; init; } = MediaStatsGroupBy.None;
    public int Top { get; init; } = 20;
}

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class MediaStatsDto
{
    public DateTimeOffset GeneratedAt { get; set; }
    public MediaStatsFiltersDto Filters { get; set; } = new();
    public MediaStatsTotalsDto Totals { get; set; } = new();
    public string GroupBy { get; set; } = "none";
    public List<MediaStatsGroupDto> Groups { get; set; } = new();
    public bool GroupsTruncated { get; set; }
}

public class MediaStatsFiltersDto
{
    public DateTimeOffset? From { get; set; }
    public DateTimeOffset? To { get; set; }
    public List<string> Tags { get; set; } = new();
    public string TagMatch { get; set; } = "any";
    public string? ContentType { get; set; }
}

public class MediaStatsTotalsDto
{
    public int Count { get; set; }
    public long TotalBytes { get; set; }
    public long AverageBytes { get; set; }
    public long? MinBytes { get; set; }
    public long? MaxBytes { get; set; }
    public MediaSizeRefDto? Largest { get; set; }
    public DateTimeOffset? FirstUploadAt { get; set; }
    public DateTimeOffset? LastUploadAt { get; set; }
    public int UntaggedCount { get; set; }
}

public class MediaSizeRefDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public long Size { get; set; }
}

public class MediaStatsGroupDto
{
    public string Key { get; set; } = string.Empty;
    public int Count { get; set; }
    public long TotalBytes { get; set; }
}

/// <summary>Thrown when a query is well-formed but cannot be answered as asked (e.g. too many time buckets).</summary>
public class InvalidMediaQueryException : Exception
{
    public InvalidMediaQueryException(string field, string message) : base(message)
    {
        Field = field;
    }

    public string Field { get; }
}
