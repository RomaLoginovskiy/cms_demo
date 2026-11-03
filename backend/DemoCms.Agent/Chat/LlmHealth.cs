using Microsoft.Extensions.Options;

namespace DemoCms.Agent.Chat;

/// <summary>
/// Cached readiness of the model endpoint (GET {BaseUrl}/models, 2 s timeout). The UI enables the chat
/// panel from this, and chat requests fail fast with 503 while the model is down or still loading.
/// </summary>
public class LlmHealth
{
    public const string HttpClientName = "llm-health";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly LlmOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly SemaphoreSlim _probeLock = new(1, 1);
    private bool _ready;
    private DateTimeOffset _checkedAt = DateTimeOffset.MinValue;

    public LlmHealth(IHttpClientFactory httpClientFactory, IOptions<LlmOptions> options, TimeProvider timeProvider)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _timeProvider = timeProvider;
    }

    public virtual async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        if (_timeProvider.GetUtcNow() - _checkedAt < TimeSpan.FromSeconds(_options.HealthCacheSeconds))
        {
            return _ready;
        }

        await _probeLock.WaitAsync(cancellationToken);
        try
        {
            if (_timeProvider.GetUtcNow() - _checkedAt < TimeSpan.FromSeconds(_options.HealthCacheSeconds))
            {
                return _ready;
            }

            _ready = await ProbeAsync(cancellationToken);
            _checkedAt = _timeProvider.GetUtcNow();
            return _ready;
        }
        finally
        {
            _probeLock.Release();
        }
    }

    /// <summary>Called when a chat call fails on the transport, so following requests fail fast.</summary>
    public virtual void MarkUnavailable()
    {
        _ready = false;
        _checkedAt = _timeProvider.GetUtcNow();
    }

    private async Task<bool> ProbeAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(HttpMethod.Get, _options.BaseUrl.TrimEnd('/') + "/models");
            if (!string.IsNullOrEmpty(_options.ApiKey) && _options.ApiKey != "none")
            {
                request.Headers.Authorization = new("Bearer", _options.ApiKey);
            }

            using var response = await client.SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            return body.Contains($"\"{_options.Model}\"", StringComparison.Ordinal);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException)
        {
            return false;
        }
    }
}
