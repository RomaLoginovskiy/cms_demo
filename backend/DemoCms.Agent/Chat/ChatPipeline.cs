using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace DemoCms.Agent.Chat;

/// <summary>
/// State of one chat request, visible to pipeline components through an AsyncLocal (the same pattern
/// Activity.Current uses), so it needs no transport through ChatOptions.
/// </summary>
public sealed class ChatRunContext
{
    private static readonly AsyncLocal<ChatRunContext?> CurrentLocal = new();

    private readonly Func<string, object, Task> _emit;

    public ChatRunContext(Func<string, object, Task> emit)
    {
        _emit = emit;
    }

    public static ChatRunContext? Current
    {
        get => CurrentLocal.Value;
        set => CurrentLocal.Value = value;
    }

    public string? ConversationId { get; init; }
    public int LlmRounds { get; private set; }
    public int ToolCalls { get; set; }
    public List<string> ToolNames { get; } = new();

    public Task OnLlmRoundAsync()
    {
        LlmRounds++;
        return _emit("status", new { phase = "thinking" });
    }

    public Task OnToolCallAsync(string toolName)
    {
        ToolCalls++;
        ToolNames.Add(toolName);
        return _emit("status", new { phase = "tool", tool = toolName });
    }
}

/// <summary>
/// Sits between function invocation and the model client: sees every LLM round, so it counts rounds, tells the
/// browser that the model is working again, and sends the round after <c>maxToolRounds</c> without tools so the
/// model has to answer (FunctionInvokingChatClient 10.11 keeps the tools on its last streaming iteration).
/// </summary>
public sealed class RoundTrackingChatClient : DelegatingChatClient
{
    private readonly int _maxToolRounds;
    private readonly bool _requireToolOnFirstRound;

    public RoundTrackingChatClient(IChatClient innerClient, int maxToolRounds, bool requireToolOnFirstRound = false) : base(innerClient)
    {
        _maxToolRounds = maxToolRounds;
        _requireToolOnFirstRound = requireToolOnFirstRound;
    }

    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        options = await BeginRoundAsync(options);
        return await base.GetResponseAsync(messages, options, cancellationToken);
    }

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        options = await BeginRoundAsync(options);
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken))
        {
            yield return update;
        }
    }

    private async Task<ChatOptions?> BeginRoundAsync(ChatOptions? options)
    {
        if (ChatRunContext.Current is not { } run)
        {
            return options;
        }

        await run.OnLlmRoundAsync();
        if (options?.Tools is not { Count: > 0 })
        {
            return options;
        }

        if (run.LlmRounds == 1 && _requireToolOnFirstRound)
        {
            var firstRound = options.Clone();
            firstRound.ToolMode = ChatToolMode.RequireAny;
            return firstRound;
        }

        if (run.LlmRounds <= _maxToolRounds)
        {
            return options;
        }

        var lastRound = options.Clone();
        lastRound.Tools = null;
        lastRound.ToolMode = ChatToolMode.None;
        return lastRound;
    }
}
