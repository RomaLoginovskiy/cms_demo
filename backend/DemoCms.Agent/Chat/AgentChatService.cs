using System.ClientModel;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using DemoCms.Agent.Cms;
using DemoCms.Agent.Telemetry;
using DemoCms.Agent.Tools;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace DemoCms.Agent.Chat;

public sealed record ChatOutcome(
    string Outcome,
    int LlmRounds,
    int ToolCalls,
    IReadOnlyList<string> ToolNames,
    long InputTokens,
    long OutputTokens,
    string? FinishReason);

/// <summary>
/// Runs one chat: system prompt + history → tool-calling loop → SSE events (status, delta, done, error).
/// </summary>
public sealed class AgentChatService
{
    public const string PromptVersion = "v1";

    private static readonly Lazy<string> PromptTemplate = new(LoadPrompt);

    private readonly IChatClient _chatClient;
    private readonly MediaToolset _toolset;
    private readonly LlmHealth _llmHealth;
    private readonly LlmOptions _llm;
    private readonly AgentOptions _agent;
    private readonly TimeProvider _timeProvider;
    private readonly bool _captureContent;
    private readonly ILogger<AgentChatService> _logger;

    public AgentChatService(
        IChatClient chatClient,
        MediaToolset toolset,
        LlmHealth llmHealth,
        IOptions<LlmOptions> llm,
        IOptions<AgentOptions> agent,
        TimeProvider timeProvider,
        ILogger<AgentChatService> logger,
        IOptions<AgentTelemetryOptions>? telemetry = null)
    {
        _captureContent = telemetry?.Value.CaptureMessageContent ?? false;
        _chatClient = chatClient;
        _toolset = toolset;
        _llmHealth = llmHealth;
        _llm = llm.Value;
        _agent = agent.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public string SystemPrompt()
    {
        var prompt = PromptTemplate.Value.Replace(
            "{today}", _timeProvider.GetUtcNow().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), StringComparison.Ordinal);
        return _llm.DisableThinking ? prompt.TrimEnd() + " /no_think" : prompt;
    }

    /// <summary>Streams one chat to <paramref name="sse"/>; never throws for model, tool or timeout failures.</summary>
    public async Task<ChatOutcome> RunAsync(ChatRequest request, SseWriter sse, CancellationToken requestAborted)
    {
        var started = Stopwatch.GetTimestamp();
        var run = new ChatRunContext(sse.WriteAsync) { ConversationId = request.ConversationId };
        ChatRunContext.Current = run;

        // GenAI semconv "invoke_agent {gen_ai.agent.name}" (internal): one span per agent run; the inference
        // ("chat cms-agent-llm") and execute_tool spans nest under it.
        using var agentActivity = AgentTelemetry.ActivitySource.StartActivity(
            $"{GenAiSemconv.OperationInvokeAgent} {GenAiSemconv.CmsAgentName}", ActivityKind.Internal);
        TagAgentStart(agentActivity, request);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(_agent.RequestTimeoutSeconds));

        var messages = new List<ChatMessage> { new(ChatRole.System, SystemPrompt()) };
        messages.AddRange(request.Messages!.Select(m =>
            new ChatMessage(m.Role == "assistant" ? ChatRole.Assistant : ChatRole.User, m.Content!.Trim())));

        var options = new ChatOptions
        {
            ModelId = _llm.Model,
            Temperature = _llm.Temperature,
            TopP = _llm.TopP,
            MaxOutputTokens = _llm.MaxOutputTokens,
            ToolMode = ChatToolMode.Auto,
            Tools = _toolset.CreateTools()
        };

        var answer = new StringBuilder();
        long inputTokens = 0, outputTokens = 0;
        string? finishReason = null;
        string outcome;

        try
        {
            await foreach (var update in _chatClient.GetStreamingResponseAsync(messages, options, timeout.Token))
            {
                foreach (var content in update.Contents)
                {
                    switch (content)
                    {
                        case FunctionCallContent call:
                            await run.OnToolCallAsync(call.Name);
                            break;
                        case TextContent { Text.Length: > 0 } text:
                            var chunk = answer.Length == 0 ? text.Text.TrimStart() : text.Text;
                            if (chunk.Length > 0)
                            {
                                answer.Append(chunk);
                                await sse.WriteAsync("delta", new { text = chunk });
                            }
                            break;
                        case UsageContent usage:
                            inputTokens += usage.Details.InputTokenCount ?? 0;
                            outputTokens += usage.Details.OutputTokenCount ?? 0;
                            break;
                    }
                }

                finishReason = update.FinishReason?.Value ?? finishReason;
            }

            if (answer.Length > 0)
            {
                outcome = "ok";
                await sse.WriteAsync("done", new
                {
                    traceId = Activity.Current?.TraceId.ToString(),
                    toolCalls = run.ToolCalls,
                    llmRounds = run.LlmRounds,
                    durationMs = (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                    finishReason
                });
            }
            else
            {
                outcome = run.LlmRounds > _agent.MaxToolRounds ? "tool_limit" : "empty_answer";
                await sse.WriteAsync("error", Error(outcome == "tool_limit" ? "tool_limit" : "internal",
                    "The assistant could not finish an answer. Try a more specific question."));
            }
        }
        catch (OperationCanceledException) when (requestAborted.IsCancellationRequested)
        {
            outcome = "client_aborted";
        }
        catch (OperationCanceledException)
        {
            outcome = "llm_timeout";
            await sse.WriteAsync("error", Error("llm_timeout", "The assistant took too long to answer. Please try again."));
        }
        catch (CmsUnavailableException ex)
        {
            outcome = "cms_unavailable";
            _logger.LogWarning(ex, "CMS API unavailable during chat");
            await sse.WriteAsync("error", Error("cms_unavailable", "The media library is not reachable right now."));
        }
        catch (Exception ex) when (ex is ClientResultException or HttpRequestException)
        {
            outcome = "llm_unavailable";
            _llmHealth.MarkUnavailable();
            _logger.LogWarning(ex, "Model endpoint failed during chat");
            await sse.WriteAsync("error", Error("llm_unavailable", "The assistant is unavailable right now."));
        }
        catch (Exception ex)
        {
            outcome = "internal";
            _logger.LogError(ex, "Chat failed");
            await sse.WriteAsync("error", Error("internal", "Something went wrong."));
        }
        finally
        {
            ChatRunContext.Current = null;
        }

        var elapsed = Stopwatch.GetElapsedTime(started);
        var activity = agentActivity;
        activity?.SetTag(GenAiSemconv.UsageInputTokens, inputTokens);
        activity?.SetTag(GenAiSemconv.UsageOutputTokens, outputTokens);
        if (finishReason is not null)
        {
            activity?.SetTag(GenAiSemconv.ResponseFinishReasons, new[] { finishReason });
        }
        if (_captureContent && answer.Length > 0)
        {
            activity?.SetTag(GenAiSemconv.OutputMessages, JsonSerializer.Serialize(new[]
            {
                new { role = "assistant", parts = new[] { new { type = "text", content = answer.ToString() } }, finish_reason = finishReason ?? "stop" }
            }));
        }
        activity?.SetTag("cms_agent.prompt_version", PromptVersion);
        activity?.SetTag("cms_agent.outcome", outcome);
        activity?.SetTag("cms_agent.llm_rounds", run.LlmRounds);
        activity?.SetTag("cms_agent.tool_calls", run.ToolCalls);
        var failed = outcome is not ("ok" or "client_aborted");
        if (failed)
        {
            activity?.SetTag(GenAiSemconv.ErrorType, outcome);
            activity?.SetStatus(ActivityStatusCode.Error, outcome);
        }

        var agentTags = new TagList
        {
            { GenAiSemconv.OperationName, GenAiSemconv.OperationInvokeAgent },
            { GenAiSemconv.ProviderName, GenAiSemconv.ProviderOpenAi },
            { GenAiSemconv.AgentName, GenAiSemconv.CmsAgentName },
            { GenAiSemconv.RequestModel, _llm.Model }
        };
        if (failed)
        {
            agentTags.Add(GenAiSemconv.ErrorType, outcome);
        }
        GenAiSemconv.InvokeAgentDuration.Record(elapsed.TotalSeconds, agentTags);
        var callTags = new TagList { { GenAiSemconv.AgentName, GenAiSemconv.CmsAgentName } };
        GenAiSemconv.InvokeAgentInferenceCalls.Record(run.LlmRounds, callTags);
        GenAiSemconv.InvokeAgentToolCalls.Record(run.ToolCalls, callTags);

        var outcomeTag = new KeyValuePair<string, object?>("outcome", outcome);
        AgentTelemetry.ChatRequests.Add(1, outcomeTag);
        AgentTelemetry.ChatDuration.Record(elapsed.TotalSeconds, outcomeTag);

        _logger.LogInformation(
            "Chat finished: outcome {Outcome}, {LlmRounds} LLM rounds, tools [{Tools}], {InputTokens} input / {OutputTokens} output tokens, {DurationMs} ms",
            outcome, run.LlmRounds, string.Join(",", run.ToolNames), inputTokens, outputTokens, (long)elapsed.TotalMilliseconds);

        return new ChatOutcome(outcome, run.LlmRounds, run.ToolCalls, run.ToolNames, inputTokens, outputTokens, finishReason);
    }

    private void TagAgentStart(Activity? activity, ChatRequest request)
    {
        if (activity is null)
        {
            return;
        }

        activity.SetTag(GenAiSemconv.OperationName, GenAiSemconv.OperationInvokeAgent);
        activity.SetTag(GenAiSemconv.ProviderName, GenAiSemconv.ProviderOpenAi);
        activity.SetTag(GenAiSemconv.AgentId, GenAiSemconv.CmsAgentId);
        activity.SetTag(GenAiSemconv.AgentName, GenAiSemconv.CmsAgentName);
        activity.SetTag(GenAiSemconv.AgentDescription, GenAiSemconv.CmsAgentDescription);
        activity.SetTag(GenAiSemconv.AgentVersion, PromptVersion);
        activity.SetTag(GenAiSemconv.RequestModel, _llm.Model);
        activity.SetTag(GenAiSemconv.RequestMaxTokens, _llm.MaxOutputTokens);
        activity.SetTag(GenAiSemconv.RequestTemperature, (double)_llm.Temperature);
        activity.SetTag(GenAiSemconv.RequestTopP, (double)_llm.TopP);
        if (Uri.TryCreate(_llm.BaseUrl, UriKind.Absolute, out var endpoint))
        {
            activity.SetTag(GenAiSemconv.ServerAddress, endpoint.Host);
            activity.SetTag(GenAiSemconv.ServerPort, endpoint.Port);
        }
        if (request.ConversationId is { } conversationId)
        {
            activity.SetTag(GenAiSemconv.ConversationId, conversationId);
        }

        // Opt-in content attributes (semconv JSON part structure), local debugging only.
        if (_captureContent)
        {
            activity.SetTag(GenAiSemconv.SystemInstructions, JsonSerializer.Serialize(new[] { new { type = "text", content = SystemPrompt() } }));
            activity.SetTag(GenAiSemconv.InputMessages, JsonSerializer.Serialize(request.Messages!.Select(m => new
            {
                role = m.Role,
                parts = new[] { new { type = "text", content = m.Content } }
            })));
        }
    }

    private static object Error(string code, string message) => new { code, message };

    private static string LoadPrompt()
    {
        using var stream = typeof(AgentChatService).Assembly.GetManifestResourceStream($"DemoCms.Agent.Prompts.system.{PromptVersion}.md")
            ?? throw new InvalidOperationException("System prompt resource is missing.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
