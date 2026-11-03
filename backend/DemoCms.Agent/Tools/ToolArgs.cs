using System.Globalization;
using System.Text.Json;

namespace DemoCms.Agent.Tools;

/// <summary>
/// Lenient reader over tool-call arguments. Models send JSON values of slightly wrong types
/// ("5" for 5, "nature" for ["nature"]); those are accepted, and out-of-range numbers are clamped.
/// </summary>
public sealed class ToolArgs
{
    private readonly IReadOnlyDictionary<string, object?> _values;

    public ToolArgs(IEnumerable<KeyValuePair<string, object?>> values)
    {
        _values = values.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
    }

    public string? String(string name)
    {
        if (!_values.TryGetValue(name, out var value) || value is null)
        {
            return null;
        }

        var text = value switch
        {
            JsonElement { ValueKind: JsonValueKind.String } e => e.GetString(),
            JsonElement { ValueKind: JsonValueKind.Null or JsonValueKind.Undefined } => null,
            JsonElement e => e.GetRawText(),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString()
        };
        return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    }

    public int Int(string name, int fallback, int min, int max)
    {
        var text = String(name);
        if (text is null || !double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
        {
            return fallback;
        }

        return (int)Math.Clamp(Math.Round(number), min, max);
    }

    public bool Bool(string name)
    {
        var text = String(name);
        return text is not null && (text.Equals("true", StringComparison.OrdinalIgnoreCase) || text == "1");
    }

    public IReadOnlyList<string> StringList(string name, int maxItems)
    {
        if (!_values.TryGetValue(name, out var value) || value is null)
        {
            return Array.Empty<string>();
        }

        IEnumerable<string?> items = value switch
        {
            JsonElement { ValueKind: JsonValueKind.Array } e => e.EnumerateArray().Select(i => i.ValueKind == JsonValueKind.String ? i.GetString() : i.GetRawText()),
            JsonElement { ValueKind: JsonValueKind.String } e => (e.GetString() ?? string.Empty).Split(','),
            string s => s.Split(','),
            IEnumerable<object?> list => list.Select(o => o?.ToString()),
            _ => Array.Empty<string?>()
        };

        return items
            .Select(i => i?.Trim())
            .Where(i => !string.IsNullOrEmpty(i))
            .Select(i => i!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(maxItems)
            .ToList();
    }

    /// <summary>Returns the value if it is one of <paramref name="allowed"/> (case-insensitive), the fallback if absent, or an error.</summary>
    public (string? Value, object? Error) Enum(string name, IReadOnlyList<string> allowed, string fallback)
    {
        var text = String(name);
        if (text is null)
        {
            return (fallback, null);
        }

        var match = allowed.FirstOrDefault(a => a.Equals(text, StringComparison.OrdinalIgnoreCase));
        return match is not null ? (match, null) : (null, ToolErrors.InvalidArgument(name, $"Unknown value '{text}'.", allowed));
    }
}

public static class ToolErrors
{
    public static object InvalidArgument(string field, string message, IReadOnlyList<string>? allowed = null) =>
        new { error = "invalid_argument", field, message, allowed };

    public static object NotFound(string message) => new { error = "not_found", message };
}
