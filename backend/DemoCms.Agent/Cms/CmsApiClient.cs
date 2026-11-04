using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DemoCms.Core.DTOs;

namespace DemoCms.Agent.Cms;

/// <summary>Typed client for the read-only endpoints of cms-backend.</summary>
public class CmsApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;

    public CmsApiClient(HttpClient http)
    {
        _http = http;
    }

    public virtual Task<PagedResult<MediaDto>?> SearchAsync(IReadOnlyDictionary<string, string?> query, CancellationToken cancellationToken) =>
        GetAsync<PagedResult<MediaDto>>("/api/media/search", query, cancellationToken);

    public virtual Task<MediaStatsDto?> GetStatsAsync(IReadOnlyDictionary<string, string?> query, CancellationToken cancellationToken) =>
        GetAsync<MediaStatsDto>("/api/media/stats", query, cancellationToken);

    /// <summary>Returns null when the item does not exist.</summary>
    public virtual Task<MediaDto?> GetMediaAsync(Guid id, CancellationToken cancellationToken) =>
        GetAsync<MediaDto>($"/api/media/{id}", null, cancellationToken);

    private async Task<T?> GetAsync<T>(string path, IReadOnlyDictionary<string, string?>? query, CancellationToken cancellationToken)
    {
        var url = path + QueryString(query);
        HttpResponseMessage response;
        try
        {
            response = await _http.GetAsync(url, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            throw new CmsUnavailableException($"GET {path} failed: {ex.GetType().Name}", ex);
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return default;
            }

            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new CmsBadRequestException(ReadValidationErrors(body));
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new CmsUnavailableException($"GET {path} returned {(int)response.StatusCode}");
            }

            return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
        }
    }

    private static string QueryString(IReadOnlyDictionary<string, string?>? query)
    {
        if (query is null)
        {
            return string.Empty;
        }

        var pairs = query
            .Where(kv => !string.IsNullOrEmpty(kv.Value))
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}")
            .ToList();
        return pairs.Count == 0 ? string.Empty : "?" + string.Join("&", pairs);
    }

    private static Dictionary<string, string[]> ReadValidationErrors(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Object)
            {
                return errors.EnumerateObject().ToDictionary(
                    p => p.Name,
                    p => p.Value.ValueKind == JsonValueKind.Array
                        ? p.Value.EnumerateArray().Select(e => e.GetString() ?? string.Empty).ToArray()
                        : new[] { p.Value.ToString() });
            }
        }
        catch (JsonException)
        {
            // Not a ProblemDetails body; fall through.
        }

        return new Dictionary<string, string[]> { ["request"] = new[] { "rejected by the CMS API" } };
    }
}

/// <summary>The CMS API is down or timed out. Ends the chat with error code "cms_unavailable".</summary>
public sealed class CmsUnavailableException : Exception
{
    public CmsUnavailableException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>The CMS API rejected the query (400). Reported back to the model as a tool error.</summary>
public sealed class CmsBadRequestException : Exception
{
    public CmsBadRequestException(IReadOnlyDictionary<string, string[]> errors) : base("The CMS API rejected the query.")
    {
        Errors = errors;
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}
