using System.Globalization;
using System.Text.Json;
using DemoCms.Agent.Cms;
using DemoCms.Core.DTOs;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace DemoCms.Agent.Tools;

/// <summary>
/// The four read-only tools of the agent (section 6 of spec/components/cms-media-agent.md).
/// Numbers come from cms-backend; this class only resolves periods, maps arguments and adds *Human sizes.
/// </summary>
public sealed class MediaToolset
{
    private static readonly string[] SortValues = { "newest", "oldest", "largest", "smallest", "title" };
    private static readonly string[] GroupByValues = { "none", "contentType", "tag", "day", "week", "month" };

    private static readonly Dictionary<string, string> SortToApi = new()
    {
        ["newest"] = "uploadedAt_desc",
        ["oldest"] = "uploadedAt_asc",
        ["largest"] = "size_desc",
        ["smallest"] = "size_asc",
        ["title"] = "title_asc"
    };

    private const string FilterProperties = """
        "period": {"type": "string", "enum": ["today", "yesterday", "this_week", "last_week", "last_7_days", "last_30_days", "this_month", "last_month", "this_year", "all_time", "custom"], "description": "Upload period. Default all_time."},
        "from": {"type": "string", "format": "date", "description": "Start date, only with period=custom."},
        "to": {"type": "string", "format": "date", "description": "End date (exclusive), only with period=custom."},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "matchAllTags": {"type": "boolean", "description": "true: item must have all tags. Default false (any)."},
        "contentType": {"type": "string", "description": "'image', 'text', or a MIME type such as image/png."}
        """;

    private readonly CmsApiClient _cms;
    private readonly PeriodResolver _periods;
    private readonly int _maxResultChars;

    public MediaToolset(CmsApiClient cms, PeriodResolver periods, IOptions<AgentOptions> options)
    {
        _cms = cms;
        _periods = periods;
        _maxResultChars = options.Value.ToolResultMaxChars;
    }

    public IList<AITool> CreateTools() => new List<AITool>
    {
        new CmsTool(
            "search_media",
            "Find media items by text, tags, content type and upload period, sorted by sortBy (largest = biggest files first, newest = latest uploads first). Returns up to `limit` items and the total number that match.",
            $$$"""
            {"type": "object", "properties": {
              "text": {"type": "string", "maxLength": 100, "description": "Matches title, file name and description."},
              {{{FilterProperties}}},
              "sortBy": {"type": "string", "enum": ["newest", "oldest", "largest", "smallest", "title"], "description": "largest/smallest sort by file size; newest/oldest by upload time. Default newest."},
              "limit": {"type": "integer", "minimum": 1, "maximum": 20}
            }}
            """,
            SearchAsync),
        new CmsTool(
            "get_media_details",
            "Get all details of one media item by its id (from search results).",
            """{"type": "object", "properties": {"id": {"type": "string", "format": "uuid"}}, "required": ["id"]}""",
            DetailsAsync),
        new CmsTool(
            "get_media_stats",
            "Count media and total, average, smallest and largest sizes, optionally filtered and grouped by content type, tag, day, week or month. Use it for every 'how many' or 'how much space' question.",
            $$$"""
            {"type": "object", "properties": {
              {{{FilterProperties}}},
              "groupBy": {"type": "string", "enum": ["none", "contentType", "tag", "day", "week", "month"]},
              "top": {"type": "integer", "minimum": 1, "maximum": 20}
            }}
            """,
            StatsAsync),
        new CmsTool(
            "list_tags",
            "List tags with how many media items use each, most used first.",
            """{"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}}}""",
            ListTagsAsync)
    };

    private async Task<object> SearchAsync(ToolArgs args, CancellationToken cancellationToken)
    {
        var (period, periodError) = _periods.Resolve(args.String("period"), args.String("from"), args.String("to"));
        if (periodError is not null)
        {
            return periodError;
        }

        var (sortBy, sortError) = args.Enum("sortBy", SortValues, "newest");
        if (sortError is not null)
        {
            return sortError;
        }

        var limit = args.Int("limit", 10, 1, 20);
        var query = Filters(args, period!);
        query["sort"] = SortToApi[sortBy!];
        query["page"] = "1";
        query["pageSize"] = limit.ToString(CultureInfo.InvariantCulture);

        var page = await _cms.SearchAsync(query, cancellationToken) ?? new PagedResult<MediaDto>();
        var items = page.Items.Select(m => new
        {
            id = m.Id,
            title = string.IsNullOrWhiteSpace(m.Title) ? m.FileName : m.Title,
            fileName = m.FileName,
            contentType = m.ContentType,
            size = m.Size,
            sizeHuman = SizeFormatter.Format(m.Size),
            uploadedAt = m.UploadedAt,
            tags = m.Tags,
            description = Truncate(m.Description, 200)
        }).ToList();

        return FitList(items, (list, truncated) => new
        {
            period = PeriodView(period!),
            total = page.Total,
            returned = list.Count,
            truncated = truncated ? true : (bool?)null,
            items = list
        });
    }

    private async Task<object> DetailsAsync(ToolArgs args, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(args.String("id"), out var id))
        {
            return ToolErrors.InvalidArgument("id", "Use an id from search_media results.");
        }

        var media = await _cms.GetMediaAsync(id, cancellationToken);
        if (media is null)
        {
            return ToolErrors.NotFound($"No media item with id {id}.");
        }

        return new
        {
            id = media.Id,
            title = string.IsNullOrWhiteSpace(media.Title) ? media.FileName : media.Title,
            fileName = media.FileName,
            description = Truncate(media.Description, 500),
            contentType = media.ContentType,
            size = media.Size,
            sizeHuman = SizeFormatter.Format(media.Size),
            uploadedAt = media.UploadedAt,
            tags = media.Tags
        };
    }

    private async Task<object> StatsAsync(ToolArgs args, CancellationToken cancellationToken)
    {
        var (period, periodError) = _periods.Resolve(args.String("period"), args.String("from"), args.String("to"));
        if (periodError is not null)
        {
            return periodError;
        }

        var (groupBy, groupByError) = args.Enum("groupBy", GroupByValues, "none");
        if (groupByError is not null)
        {
            return groupByError;
        }

        var query = Filters(args, period!);
        query["groupBy"] = groupBy;
        query["top"] = args.Int("top", 10, 1, 20).ToString(CultureInfo.InvariantCulture);

        var stats = await _cms.GetStatsAsync(query, cancellationToken) ?? new MediaStatsDto();
        var totals = stats.Totals;
        var groups = stats.Groups.Select(g => new
        {
            key = g.Key,
            count = g.Count,
            totalBytes = g.TotalBytes,
            totalHuman = SizeFormatter.Format(g.TotalBytes)
        }).ToList();

        return FitList(groups, (list, truncated) => new
        {
            period = PeriodView(period!),
            totals = new
            {
                count = totals.Count,
                totalBytes = totals.TotalBytes,
                totalHuman = SizeFormatter.Format(totals.TotalBytes),
                averageHuman = totals.Count > 0 ? SizeFormatter.Format(totals.AverageBytes) : null,
                minHuman = totals.MinBytes is { } min ? SizeFormatter.Format(min) : null,
                maxHuman = totals.MaxBytes is { } max ? SizeFormatter.Format(max) : null,
                largest = totals.Largest is { } largest
                    ? new { id = largest.Id, title = largest.Title, sizeHuman = SizeFormatter.Format(largest.Size) }
                    : null,
                firstUploadAt = totals.FirstUploadAt,
                lastUploadAt = totals.LastUploadAt,
                untaggedCount = totals.UntaggedCount
            },
            groupBy = stats.GroupBy,
            groups = list.Count > 0 ? list : null,
            groupsTruncated = stats.GroupsTruncated || truncated ? true : (bool?)null
        });
    }

    private async Task<object> ListTagsAsync(ToolArgs args, CancellationToken cancellationToken)
    {
        var limit = args.Int("limit", 20, 1, 50);
        var query = new Dictionary<string, string?>
        {
            ["groupBy"] = "tag",
            ["top"] = limit.ToString(CultureInfo.InvariantCulture)
        };

        var stats = await _cms.GetStatsAsync(query, cancellationToken) ?? new MediaStatsDto();
        var tags = stats.Groups.Select(g => new { name = g.Key, count = g.Count }).ToList();
        return FitList(tags, (list, truncated) => new
        {
            tags = list,
            truncated = stats.GroupsTruncated || truncated
        });
    }

    private static Dictionary<string, string?> Filters(ToolArgs args, ResolvedPeriod period)
    {
        var tags = args.StringList("tags", 5);
        var text = args.String("text");
        return new Dictionary<string, string?>
        {
            ["q"] = text is { Length: > 100 } ? text[..100] : text,
            ["tags"] = tags.Count > 0 ? string.Join(",", tags) : null,
            ["tagMatch"] = args.Bool("matchAllTags") ? "all" : null,
            ["contentType"] = NormaliseContentType(args.String("contentType")),
            ["from"] = period.From?.ToString("o", CultureInfo.InvariantCulture),
            ["to"] = period.To?.ToString("o", CultureInfo.InvariantCulture)
        };
    }

    private static readonly Dictionary<string, string> ContentTypeAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["images"] = "image", ["picture"] = "image", ["pictures"] = "image", ["photo"] = "image", ["photos"] = "image",
        ["texts"] = "text", ["document"] = "text", ["documents"] = "text",
        ["jpg"] = "image/jpeg", ["jpeg"] = "image/jpeg", ["png"] = "image/png", ["gif"] = "image/gif", ["webp"] = "image/webp",
        ["txt"] = "text/plain", ["csv"] = "text/csv", ["html"] = "text/html",
        ["all"] = "", ["any"] = "", ["*"] = "", ["*/*"] = ""
    };

    /// <summary>Maps what models write ("images", "jpg", "all") onto what the CMS API accepts.</summary>
    private static string? NormaliseContentType(string? value)
    {
        if (value is null)
        {
            return null;
        }

        var key = value.Trim().TrimStart('.');
        return ContentTypeAliases.TryGetValue(key, out var mapped) ? (mapped.Length == 0 ? null : mapped) : key;
    }

    private static object PeriodView(ResolvedPeriod period) => new { name = period.Name, from = period.From, to = period.To };

    private static string? Truncate(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength] + "…";

    /// <summary>Drops list entries from the end until the serialised result fits the per-tool size cap.</summary>
    private object FitList<T>(IReadOnlyList<T> items, Func<IReadOnlyList<T>, bool, object> build)
    {
        for (var count = items.Count; ; count--)
        {
            var result = build(items.Take(count).ToList(), count < items.Count);
            if (count == 0 || JsonSerializer.Serialize(result, CmsTool.ResultJsonOptions).Length <= _maxResultChars)
            {
                return result;
            }
        }
    }
}
