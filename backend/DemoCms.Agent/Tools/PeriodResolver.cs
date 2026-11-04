using System.Globalization;

namespace DemoCms.Agent.Tools;

/// <summary>A resolved upload period: half-open [From, To) in UTC; null bounds are open.</summary>
public sealed record ResolvedPeriod(string Name, DateTimeOffset? From, DateTimeOffset? To);

/// <summary>
/// Turns the tools' <c>period</c> enum into UTC ranges so the model never does date arithmetic.
/// ISO weeks start on Monday; "this_*" periods end now; "last_*" periods are complete calendar units.
/// </summary>
public sealed class PeriodResolver
{
    public static readonly string[] Names =
    {
        "today", "yesterday", "this_week", "last_week", "last_7_days", "last_30_days",
        "this_month", "last_month", "this_year", "all_time", "custom"
    };

    private readonly TimeProvider _timeProvider;

    public PeriodResolver(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    /// <summary>Resolves the period or returns a tool error object.</summary>
    public (ResolvedPeriod? Period, object? Error) Resolve(string? name, string? from, string? to)
    {
        var now = _timeProvider.GetUtcNow();
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var firstOfMonth = new DateTimeOffset(today.Year, today.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var key = string.IsNullOrWhiteSpace(name) ? "all_time" : name.Trim().ToLowerInvariant();
        // Dates count only for "custom", or when no period was named at all (then they mean a custom range).
        // With a named period they are ignored: schema-guided decoding fills every field, so a model asked
        // for "all_time" also sends invented from/to values (S1, tool_choice "required").
        if (string.IsNullOrWhiteSpace(name) && (!string.IsNullOrWhiteSpace(from) || !string.IsNullOrWhiteSpace(to)))
        {
            key = "custom";
        }

        switch (key)
        {
            case "today": return (new ResolvedPeriod(key, today, now), null);
            case "yesterday": return (new ResolvedPeriod(key, today.AddDays(-1), today), null);
            case "this_week": return (new ResolvedPeriod(key, monday, now), null);
            case "last_week": return (new ResolvedPeriod(key, monday.AddDays(-7), monday), null);
            case "last_7_days": return (new ResolvedPeriod(key, now.AddDays(-7), now), null);
            case "last_30_days": return (new ResolvedPeriod(key, now.AddDays(-30), now), null);
            case "this_month": return (new ResolvedPeriod(key, firstOfMonth, now), null);
            case "last_month": return (new ResolvedPeriod(key, firstOfMonth.AddMonths(-1), firstOfMonth), null);
            case "this_year": return (new ResolvedPeriod(key, new DateTimeOffset(today.Year, 1, 1, 0, 0, 0, TimeSpan.Zero), now), null);
            case "all_time": return (new ResolvedPeriod(key, null, null), null);
            case "custom":
                var fromValue = ParseDate(from);
                var toValue = ParseDate(to);
                if ((!string.IsNullOrWhiteSpace(from) && fromValue is null) || (!string.IsNullOrWhiteSpace(to) && toValue is null))
                {
                    return (null, ToolErrors.InvalidArgument("from/to", "Use ISO dates such as 2026-10-01."));
                }
                if (fromValue is null && toValue is null)
                {
                    return (null, ToolErrors.InvalidArgument("period", "period=custom needs 'from' and/or 'to'."));
                }
                if (fromValue is not null && toValue is not null && fromValue >= toValue)
                {
                    return (null, ToolErrors.InvalidArgument("to", "'to' must be after 'from'."));
                }
                return (new ResolvedPeriod(key, fromValue, toValue ?? now), null);
            default:
                return (null, ToolErrors.InvalidArgument("period", "Unknown period.", Names));
        }
    }

    private static DateTimeOffset? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.TryParse(value.Trim(), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)
            ? parsed
            : null;
    }
}
