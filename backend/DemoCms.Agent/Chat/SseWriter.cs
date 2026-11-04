using System.Text;
using System.Text.Json;
using DemoCms.Agent.Tools;
using Microsoft.AspNetCore.Http.Features;

namespace DemoCms.Agent.Chat;

/// <summary>
/// Writes server-sent events (event + one-line JSON data) and a comment heartbeat while the model is busy.
/// Writes are serialised because the heartbeat timer and the chat loop share the response.
/// </summary>
public sealed class SseWriter : IAsyncDisposable
{
    private static readonly byte[] Heartbeat = Encoding.UTF8.GetBytes(": ping\n\n");

    private readonly HttpResponse _response;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly TimeSpan _heartbeatInterval;
    private readonly CancellationToken _cancellationToken;
    private Timer? _timer;
    private bool _completed;

    public SseWriter(HttpResponse response, TimeSpan heartbeatInterval, CancellationToken cancellationToken)
    {
        _response = response;
        _heartbeatInterval = heartbeatInterval;
        _cancellationToken = cancellationToken;
    }

    public bool Started { get; private set; }

    public async Task StartAsync()
    {
        _response.StatusCode = StatusCodes.Status200OK;
        _response.ContentType = "text/event-stream";
        _response.Headers.CacheControl = "no-cache";
        _response.Headers["X-Accel-Buffering"] = "no";
        _response.HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        await _response.Body.FlushAsync(_cancellationToken);
        Started = true;
        _timer = new Timer(_ => _ = WriteRawAsync(Heartbeat), null, _heartbeatInterval, _heartbeatInterval);
    }

    public Task WriteAsync(string eventName, object data)
    {
        var json = JsonSerializer.Serialize(data, CmsTool.ResultJsonOptions);
        return WriteRawAsync(Encoding.UTF8.GetBytes($"event: {eventName}\ndata: {json}\n\n"));
    }

    private async Task WriteRawAsync(byte[] payload)
    {
        if (!Started || _completed || _cancellationToken.IsCancellationRequested)
        {
            return;
        }

        await _lock.WaitAsync();
        try
        {
            if (_completed)
            {
                return;
            }

            await _response.Body.WriteAsync(payload, _cancellationToken);
            await _response.Body.FlushAsync(_cancellationToken);
        }
        catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException)
        {
            // Client went away; the chat loop notices through the request-aborted token.
        }
        finally
        {
            _lock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_timer is not null)
        {
            await _timer.DisposeAsync();
        }

        await _lock.WaitAsync();
        _completed = true;
        _lock.Release();
    }
}
