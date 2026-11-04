using System.Runtime.CompilerServices;
using DemoCms.Agent;
using DemoCms.Agent.Chat;
using DemoCms.Agent.Cms;
using DemoCms.Core.DTOs;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace DemoCms.Agent.Tests;

internal sealed class FixedTimeProvider : TimeProvider
{
    public static readonly DateTimeOffset Monday = new(2026, 11, 2, 10, 0, 0, TimeSpan.Zero);

    private readonly DateTimeOffset _now;

    public FixedTimeProvider(DateTimeOffset? now = null) => _now = now ?? Monday;

    public override DateTimeOffset GetUtcNow() => _now;
}

/// <summary>Records queries and returns canned CMS responses.</summary>
internal sealed class FakeCmsApiClient : CmsApiClient
{
    public FakeCmsApiClient() : base(new HttpClient())
    {
    }

    public List<(string Endpoint, IReadOnlyDictionary<string, string?> Query)> Calls { get; } = new();
    public PagedResult<MediaDto> SearchResult { get; set; } = new();
    public MediaStatsDto StatsResult { get; set; } = new();
    public MediaDto? Media { get; set; }
    public Exception? Throw { get; set; }

    public override Task<PagedResult<MediaDto>?> SearchAsync(IReadOnlyDictionary<string, string?> query, CancellationToken cancellationToken)
    {
        Calls.Add(("search", query));
        return Throw is null ? Task.FromResult<PagedResult<MediaDto>?>(SearchResult) : Task.FromException<PagedResult<MediaDto>?>(Throw);
    }

    public override Task<MediaStatsDto?> GetStatsAsync(IReadOnlyDictionary<string, string?> query, CancellationToken cancellationToken)
    {
        Calls.Add(("stats", query));
        return Throw is null ? Task.FromResult<MediaStatsDto?>(StatsResult) : Task.FromException<MediaStatsDto?>(Throw);
    }

    public override Task<MediaDto?> GetMediaAsync(Guid id, CancellationToken cancellationToken)
    {
        Calls.Add(("media", new Dictionary<string, string?> { ["id"] = id.ToString() }));
        return Task.FromResult(Media);
    }
}

public sealed class FakeLlmHealth : LlmHealth
{
    public FakeLlmHealth(bool ready = true)
        : base(new NullHttpClientFactory(), Options.Create(new LlmOptions()), TimeProvider.System)
    {
        Ready = ready;
    }

    public bool Ready { get; set; }
    public bool MarkedUnavailable { get; private set; }

    public override Task<bool> IsReadyAsync(CancellationToken cancellationToken) => Task.FromResult(Ready);

    public override void MarkUnavailable()
    {
        MarkedUnavailable = true;
        Ready = false;
    }

    private sealed class NullHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}

/// <summary>
/// A model that plays back scripted rounds: each round is a list of updates (tool calls, text, usage).
/// Records what it was sent so tests can check tools and messages per round.
/// </summary>
public sealed class ScriptedChatClient : IChatClient
{
    private readonly Queue<Func<IReadOnlyList<ChatResponseUpdate>>> _rounds = new();

    public List<(List<ChatMessage> Messages, ChatOptions? Options)> Requests { get; } = new();

    public ScriptedChatClient Round(params AIContent[] contents)
    {
        _rounds.Enqueue(() => new[] { new ChatResponseUpdate(ChatRole.Assistant, contents.ToList()) { ModelId = "cms-agent-llm" } });
        return this;
    }

    public ScriptedChatClient Text(params string[] chunks)
    {
        _rounds.Enqueue(() => chunks
            .Select(c => new ChatResponseUpdate(ChatRole.Assistant, c) { ModelId = "cms-agent-llm" })
            .Append(new ChatResponseUpdate(ChatRole.Assistant, new List<AIContent>
            {
                new UsageContent(new UsageDetails { InputTokenCount = 900, OutputTokenCount = 20, TotalTokenCount = 920 })
            }) { FinishReason = ChatFinishReason.Stop })
            .ToList());
        return this;
    }

    public ScriptedChatClient Fail(Exception exception)
    {
        _rounds.Enqueue(() => throw exception);
        return this;
    }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("The agent streams.");

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        Requests.Add((messages.ToList(), options));
        var updates = _rounds.Count > 0 ? _rounds.Dequeue()() : throw new InvalidOperationException("No scripted round left.");
        foreach (var update in updates)
        {
            await Task.Yield();
            yield return update;
        }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) =>
        serviceType == typeof(ChatClientMetadata) ? new ChatClientMetadata("vllm", new Uri("http://vllm:8000/v1"), "cms-agent-llm") : null;

    public void Dispose()
    {
    }
}
