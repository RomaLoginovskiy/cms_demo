using System.Globalization;
using System.Text.RegularExpressions;
using DemoCms.Core.DTOs;

namespace DemoCms.Api.Queries;

/// <summary>Query-string filters shared by <c>GET /api/media/search</c> and <c>GET /api/media/stats</c>.</summary>
public class MediaFilterParameters
{
    public string? Q { get; set; }
    public string? Tags { get; set; }
    public string? TagMatch { get; set; }
    public string? ContentType { get; set; }
    public string? From { get; set; }
    public string? To { get; set; }
}

public class MediaSearchParameters : MediaFilterParameters
{
    public string? Sort { get; set; }
    public int? Page { get; set; }
    public int? PageSize { get; set; }
}

public class MediaStatsParameters : MediaFilterParameters
{
    public string? GroupBy { get; set; }
    public int? Top { get; set; }
}

/// <summary>
/// Validates and normalises query-string parameters into service queries. Errors are keyed by parameter name
/// so the controller can return them as a ValidationProblem.
/// </summary>
public static partial class MediaQueryParser
{
    public const int MaxTextLength = 100;
    public const int MaxTags = 5;
    public const int MaxTagLength = 50;
    public const int MaxPageSize = 100;
    public const int MaxTop = 100;

    private static readonly Dictionary<string, MediaSort> SortValues = new(StringComparer.OrdinalIgnoreCase)
    {
        ["uploadedAt_desc"] = MediaSort.UploadedAtDesc,
        ["uploadedAt_asc"] = MediaSort.UploadedAtAsc,
        ["size_desc"] = MediaSort.SizeDesc,
        ["size_asc"] = MediaSort.SizeAsc,
        ["title_asc"] = MediaSort.TitleAsc
    };

    private static readonly Dictionary<string, MediaStatsGroupBy> GroupByValues = new(StringComparer.OrdinalIgnoreCase)
    {
        ["none"] = MediaStatsGroupBy.None,
        ["contentType"] = MediaStatsGroupBy.ContentType,
        ["tag"] = MediaStatsGroupBy.Tag,
        ["day"] = MediaStatsGroupBy.Day,
        ["week"] = MediaStatsGroupBy.Week,
        ["month"] = MediaStatsGroupBy.Month
    };

    public static MediaSearchQuery ParseSearch(MediaSearchParameters parameters, IDictionary<string, string[]> errors)
    {
        var filter = ParseFilter(parameters, errors);

        var sort = MediaSort.UploadedAtDesc;
        if (!string.IsNullOrWhiteSpace(parameters.Sort) && !SortValues.TryGetValue(parameters.Sort.Trim(), out sort))
        {
            AddError(errors, "sort", $"Allowed values: {string.Join(", ", SortValues.Keys)}.");
        }

        var page = parameters.Page ?? 1;
        if (page < 1)
        {
            AddError(errors, "page", "Must be 1 or greater.");
        }

        var pageSize = parameters.PageSize ?? 20;
        if (pageSize is < 1 or > MaxPageSize)
        {
            AddError(errors, "pageSize", $"Must be between 1 and {MaxPageSize}.");
        }

        return new MediaSearchQuery
        {
            Text = filter.Text,
            Tags = filter.Tags,
            TagMatch = filter.TagMatch,
            ContentType = filter.ContentType,
            From = filter.From,
            To = filter.To,
            Sort = sort,
            Page = page,
            PageSize = pageSize
        };
    }

    public static MediaStatsQuery ParseStats(MediaStatsParameters parameters, IDictionary<string, string[]> errors)
    {
        var filter = ParseFilter(parameters, errors);

        var groupBy = MediaStatsGroupBy.None;
        if (!string.IsNullOrWhiteSpace(parameters.GroupBy) && !GroupByValues.TryGetValue(parameters.GroupBy.Trim(), out groupBy))
        {
            AddError(errors, "groupBy", $"Allowed values: {string.Join(", ", GroupByValues.Keys)}.");
        }

        var top = parameters.Top ?? 20;
        if (top is < 1 or > MaxTop)
        {
            AddError(errors, "top", $"Must be between 1 and {MaxTop}.");
        }

        return new MediaStatsQuery
        {
            Text = filter.Text,
            Tags = filter.Tags,
            TagMatch = filter.TagMatch,
            ContentType = filter.ContentType,
            From = filter.From,
            To = filter.To,
            GroupBy = groupBy,
            Top = top
        };
    }

    private static MediaFilter ParseFilter(MediaFilterParameters parameters, IDictionary<string, string[]> errors)
    {
        var text = string.IsNullOrWhiteSpace(parameters.Q) ? null : parameters.Q.Trim();
        if (text is { Length: > MaxTextLength })
        {
            AddError(errors, "q", $"Must be at most {MaxTextLength} characters.");
        }

        var tags = (parameters.Tags ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(t => t.ToLowerInvariant())
            .Distinct()
            .ToList();
        if (tags.Count > MaxTags)
        {
            AddError(errors, "tags", $"At most {MaxTags} tags.");
        }
        if (tags.Any(t => t.Length > MaxTagLength))
        {
            AddError(errors, "tags", $"Each tag must be at most {MaxTagLength} characters.");
        }

        var tagMatch = parameters.TagMatch?.Trim().ToLowerInvariant() switch
        {
            null or "" or "any" => TagMatch.Any,
            "all" => TagMatch.All,
            _ => (TagMatch?)null
        };
        if (tagMatch is null)
        {
            AddError(errors, "tagMatch", "Allowed values: any, all.");
        }

        var contentType = NormaliseContentType(parameters.ContentType, errors);
        var from = ParseInstant(parameters.From, "from", errors);
        var to = ParseInstant(parameters.To, "to", errors);
        if (from is not null && to is not null && from >= to)
        {
            AddError(errors, "to", "Must be later than 'from'.");
        }

        return new MediaFilter
        {
            Text = text,
            Tags = tags,
            TagMatch = tagMatch ?? TagMatch.Any,
            ContentType = contentType,
            From = from,
            To = to
        };
    }

    /// <summary>"image/png" stays exact; "image", "image/" and "image/*" become the family "image".</summary>
    private static string? NormaliseContentType(string? value, IDictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var contentType = value.Trim().ToLowerInvariant();
        if (contentType.EndsWith("/*", StringComparison.Ordinal))
        {
            contentType = contentType[..^2];
        }
        contentType = contentType.TrimEnd('/');

        if (!ContentTypePattern().IsMatch(contentType))
        {
            AddError(errors, "contentType", "Use a MIME type (image/png) or a family (image).");
            return null;
        }

        return contentType;
    }

    /// <summary>ISO-8601 date or date-time; values without an offset are UTC.</summary>
    private static DateTimeOffset? ParseInstant(string? value, string field, IDictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateTimeOffset.TryParse(
                value.Trim(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var instant))
        {
            return instant;
        }

        AddError(errors, field, "Must be an ISO-8601 date or date-time.");
        return null;
    }

    private static void AddError(IDictionary<string, string[]> errors, string field, string message)
    {
        errors[field] = errors.TryGetValue(field, out var existing) ? existing.Append(message).ToArray() : new[] { message };
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9.+-]*(/[a-z0-9][a-z0-9.+-]*)?$")]
    private static partial Regex ContentTypePattern();
}
