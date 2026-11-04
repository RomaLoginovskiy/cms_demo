using System.Globalization;

namespace DemoCms.Agent.Tools;

/// <summary>
/// Same output as <c>formatFileSize</c> in frontend/src/components/MediaStats.tsx: base 1024,
/// Bytes/KB/MB/GB, at most two decimals with trailing zeros dropped. UI and agent show identical strings.
/// </summary>
public static class SizeFormatter
{
    private static readonly string[] Units = { "Bytes", "KB", "MB", "GB" };

    public static string Format(long bytes)
    {
        if (bytes <= 0)
        {
            return "0 Bytes";
        }

        var exponent = Math.Min((int)Math.Floor(Math.Log(bytes) / Math.Log(1024)), Units.Length - 1);
        var value = Math.Round(bytes / Math.Pow(1024, exponent), 2, MidpointRounding.AwayFromZero);
        return value.ToString("0.##", CultureInfo.InvariantCulture) + " " + Units[exponent];
    }
}
