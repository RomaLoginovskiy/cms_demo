using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DemoCms.Agent.Chat;
using DemoCms.Agent.Cms;
using DemoCms.Agent.Telemetry;
using DemoCms.Agent.Tools;
using DemoCms.Core.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace DemoCms.Agent.Tests;

public sealed class ChatRequestValidatorTests
{
    private static readonly AgentOptions Options = new();

    private static ChatRequest Request(params (string Role, string Content)[] messages) => new()
    {
        Messages = messages.Select(m => new ChatMessageDto { Role = m.Role, Content = m.Content }).ToList()
    };

    [Fact]
    public void AcceptsAlternatingHistoryEndingWithUser()
    {
        var errors = ChatRequestValidator.Validate(Request(("user", "hi"), ("assistant", "hello"), ("user", "how many files?")), Options);

        Assert.Empty(errors);
    }

    [Fact]
    public void RejectsEmptyWrongOrderAndOversizedMessages()
    {
        Assert.NotEmpty(ChatRequestValidator.Validate(new ChatRequest(), Options));
        Assert.NotEmpty(ChatRequestValidator.Validate(Request(("assistant", "hello")), Options));
        Assert.NotEmpty(ChatRequestValidator.Validate(Request(("user", "a"), ("user", "b")), Options));
        Assert.NotEmpty(ChatRequestValidator.Validate(Request(("user", new string('x', 2001))), Options));
        Assert.NotEmpty(ChatRequestValidator.Validate(Request(Enumerable.Range(0, 13).Select(i => (i % 2 == 0 ? "user" : "assistant", "x")).ToArray()), Options));
    }
}

/// <summary>
/// Runs the production pipeline (function invocation, round tracking, OpenTelemetry) against a scripted model
/// and checks the SSE stream and the emitted spans.
/// </summary>
[Collection(GenAiTelemetryCollection.Name)]
public sealed class AgentChatServiceTests : IDisposable
{
    private static readonly ActivitySource TestSource = new("DemoCms.Agent.Tests");

    private readonly FakeCmsApiClient _cms = new();
    private readonly FakeLlmHealth _health = new();
    private readonly ScriptedChatClient _model = new();
    private readonly List<Activity> _activities = new();
    private readonly ActivityListener _listener;

    public AgentChatServiceTests()
    {
        _listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name is AgentTelemetry.GenAiSourceName or AgentTelemetry.SourceName or "DemoCms.Agent.Tests",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => { lock (_activities) { _activities.Add(activity); } }
        };
        ActivitySource.AddActivityListener(_listener);
    }

    public void Dispose() => _listener.Dispose();

    private async Task<(List<(string Event, JsonElement Data)> Events, ChatOutcome Outcome, ActivityTraceId TraceId)> RunAsync(
        string question, AgentOptions? options = null, string? conversationId = null)
    {
        options ??= new AgentOptions { HeartbeatSeconds = 60 };
        var chatClient = AgentChatPipeline.Build(_model, NullLoggerFactory.Instance, options, captureContent: false, new Uri("http://vllm.llm.svc.cluster.local:8000/v1"));
        var toolset = new MediaToolset(_cms, new PeriodResolver(new FixedTimeProvider()), Microsoft.Extensions.Options.Options.Create(options));
        var service = new AgentChatService(chatClient, toolset, _health, Microsoft.Extensions.Options.Options.Create(new LlmOptions()),
            Microsoft.Extensions.Options.Options.Create(options), new FixedTimeProvider(), NullLogger<AgentChatService>.Instance);

        var context = new DefaultHttpContext();
        var body = new MemoryStream();
        context.Response.Body = body;

        using var root = TestSource.StartActivity("POST /api/agent/chat", ActivityKind.Server)!;
        await using (var sse = new SseWriter(context.Response, TimeSpan.FromMinutes(1), CancellationToken.None))
        {
            await sse.StartAsync();
            var outcome = await service.RunAsync(
                new ChatRequest { ConversationId = conversationId, Messages = new() { new ChatMessageDto { Role = "user", Content = question } } }, sse, CancellationToken.None);
            return (ParseEvents(Encoding.UTF8.GetString(body.ToArray())), outcome, root.TraceId);
        }
    }

    private static List<(string, JsonElement)> ParseEvents(string stream) =>
        stream.Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Where(block => block.StartsWith("event: ", StringComparison.Ordinal))
            .Select(block =>
            {
                var lines = block.Split('\n');
                return (lines[0]["event: ".Length..], JsonDocument.Parse(lines[1]["data: ".Length..]).RootElement.Clone());
            })
            .ToList();

    private List<Activity> Spans(ActivityTraceId traceId)
    {
        lock (_activities)
        {
            return _activities.Where(a => a.TraceId == traceId).ToList();
        }
    }

    [Fact]
    public async Task ToolRoundThenAnswer_StreamsStatusDeltaAndDone()
    {
        _cms.StatsResult = new MediaStatsDto { Totals = new MediaStatsTotalsDto { Count = 42, TotalBytes = 1024 } };
        _model
            .Round(new FunctionCallContent("call_1", "get_media_stats", new Dictionary<string, object?> { ["period"] = "last_week", ["contentType"] = "image" }))
            .Text("42 images were ", "uploaded last week.");

        var (events, outcome, _) = await RunAsync("How many images were uploaded last week?");

        Assert.Equal("ok", outcome.Outcome);
        Assert.Equal(2, outcome.LlmRounds);
        Assert.Equal(new[] { "get_media_stats" }, outcome.ToolNames);
        Assert.Equal(new[] { "status", "status", "status", "delta", "delta", "done" }, events.Select(e => e.Event));
        Assert.Equal("get_media_stats", events[1].Data.GetProperty("tool").GetString());
        Assert.Equal("42 images were uploaded last week.", string.Concat(events.Where(e => e.Event == "delta").Select(e => e.Data.GetProperty("text").GetString())));
        var done = events[^1].Data;
        Assert.Equal(1, done.GetProperty("toolCalls").GetInt32());
        Assert.Equal(2, done.GetProperty("llmRounds").GetInt32());
        Assert.False(string.IsNullOrEmpty(done.GetProperty("traceId").GetString()));

        // Round 1 must call a tool; round 2 may answer.
        Assert.IsType<RequiredChatToolMode>(_model.Requests[0].Options!.ToolMode);
        Assert.IsType<AutoChatToolMode>(_model.Requests[1].Options!.ToolMode);

        // The model got the tool result in round 2, and the system prompt disables Qwen3 thinking.
        Assert.Contains(_model.Requests[1].Messages, m => m.Contents.OfType<FunctionResultContent>().Any());
        Assert.EndsWith("/no_think", _model.Requests[0].Messages[0].Text);
        Assert.Equal("stats", Assert.Single(_cms.Calls).Endpoint);
    }

    [Fact]
    public async Task Telemetry_FollowsGenAiSemanticConventions()
    {
        _model
            .Round(new FunctionCallContent("call_1", "list_tags", new Dictionary<string, object?>()))
            .Text("nature ", "(12)");

        var (_, _, traceId) = await RunAsync("Which tags are used most?", conversationId: "conv-42");
        var spans = Spans(traceId);

        // invoke_agent {gen_ai.agent.name}, internal, parent of everything else.
        var agent = Assert.Single(spans, s => s.DisplayName == "invoke_agent cms-media-agent");
        Assert.Equal(ActivityKind.Internal, agent.Kind);
        Assert.Equal("invoke_agent", agent.GetTagItem("gen_ai.operation.name"));
        Assert.Equal("openai", agent.GetTagItem("gen_ai.provider.name"));
        Assert.Equal("cms-media-agent", agent.GetTagItem("gen_ai.agent.name"));
        Assert.Equal("cms-media-agent", agent.GetTagItem("gen_ai.agent.id"));
        Assert.NotNull(agent.GetTagItem("gen_ai.agent.description"));
        Assert.Equal("v1", agent.GetTagItem("gen_ai.agent.version"));
        Assert.Equal("cms-agent-llm", agent.GetTagItem("gen_ai.request.model"));
        Assert.Equal("vllm.llm.svc.cluster.local", agent.GetTagItem("server.address"));
        Assert.Equal(8000, agent.GetTagItem("server.port"));
        Assert.Equal("conv-42", agent.GetTagItem("gen_ai.conversation.id"));
        Assert.Equal(900L, agent.GetTagItem("gen_ai.usage.input_tokens"));
        Assert.Equal("ok", agent.GetTagItem("cms_agent.outcome"));
        Assert.Null(agent.GetTagItem("error.type"));

        // Inference spans: one per round, nested under invoke_agent, with the streaming extras.
        var chatSpans = spans.Where(s => s.DisplayName == "chat cms-agent-llm").ToList();
        Assert.Equal(2, chatSpans.Count);
        Assert.All(chatSpans, s =>
        {
            Assert.Equal(ActivityKind.Client, s.Kind);
            Assert.Equal("chat", s.GetTagItem("gen_ai.operation.name"));
            Assert.Equal("cms-agent-llm", s.GetTagItem("gen_ai.request.model"));
            Assert.NotNull(s.GetTagItem("gen_ai.provider.name"));
            Assert.Equal(true, s.GetTagItem("gen_ai.request.stream"));
            Assert.IsType<double>(s.GetTagItem("gen_ai.response.time_to_first_chunk"));
            Assert.Equal("conv-42", s.GetTagItem("gen_ai.conversation.id"));
            Assert.True(IsDescendantOf(s, agent, spans));
        });

        // execute_tool {gen_ai.tool.name}
        var tool = Assert.Single(spans, s => s.DisplayName == "execute_tool list_tags");
        Assert.Equal("execute_tool", tool.GetTagItem("gen_ai.operation.name"));
        Assert.Equal("list_tags", tool.GetTagItem("gen_ai.tool.name"));
        Assert.Equal("call_1", tool.GetTagItem("gen_ai.tool.call.id"));
        Assert.Equal("conv-42", tool.GetTagItem("gen_ai.conversation.id"));
        Assert.True(IsDescendantOf(tool, agent, spans));

        // Opt-in content stays off by default.
        Assert.All(spans, s =>
        {
            Assert.Null(s.GetTagItem("gen_ai.tool.call.arguments"));
            Assert.Null(s.GetTagItem("gen_ai.input.messages"));
            Assert.Null(s.GetTagItem("gen_ai.system_instructions"));
        });
    }

    [Fact]
    public async Task Telemetry_RecordsGenAiMetrics()
    {
        var recorded = new List<(string Name, double Value, Dictionary<string, object?> Tags)>();
        using var listener = new MeterListener
        {
            InstrumentPublished = (instrument, l) =>
            {
                if (instrument.Meter.Name == AgentTelemetry.SourceName && instrument.Name.StartsWith("gen_ai.", StringComparison.Ordinal))
                {
                    l.EnableMeasurementEvents(instrument);
                }
            }
        };
        void Capture(Instrument i, double v, ReadOnlySpan<KeyValuePair<string, object?>> t)
        {
            var tags = new Dictionary<string, object?>();
            foreach (var kv in t) tags[kv.Key] = kv.Value;
            lock (recorded) recorded.Add((i.Name, v, tags));
        }
        listener.SetMeasurementEventCallback<double>((i, v, t, _) => Capture(i, v, t));
        listener.SetMeasurementEventCallback<long>((i, v, t, _) => Capture(i, v, t));
        listener.Start();

        _model
            .Round(new FunctionCallContent("call_1", "list_tags", new Dictionary<string, object?>()))
            .Text("nature ", "(12)");
        await RunAsync("Which tags are used most?");
        listener.RecordObservableInstruments();

        List<(string Name, double Value, Dictionary<string, object?> Tags)> Of(string name)
        {
            lock (recorded) return recorded.Where(r => r.Name == name).ToList();
        }

        Assert.Equal(2, Of("gen_ai.client.inference.duration").Count);
        Assert.All(Of("gen_ai.client.inference.duration"), r =>
        {
            Assert.Equal("chat", r.Tags["gen_ai.operation.name"]);
            Assert.Equal("openai", r.Tags["gen_ai.provider.name"]);
            Assert.Equal("cms-agent-llm", r.Tags["gen_ai.request.model"]);
            Assert.Equal("vllm.llm.svc.cluster.local", r.Tags["server.address"]);
        });
        Assert.NotEmpty(Of("gen_ai.client.inference.time_to_first_chunk"));
        Assert.NotEmpty(Of("gen_ai.client.inference.time_per_output_chunk"));
        var input = Assert.Single(Of("gen_ai.client.inference.usage.input_tokens"));
        Assert.Equal(900, input.Value);
        Assert.Equal("text", input.Tags["gen_ai.token.modality"]);
        Assert.Single(Of("gen_ai.client.inference.usage.output_tokens"));
        Assert.Single(Of("gen_ai.client.inference.operation.input_tokens"));

        var agentDuration = Assert.Single(Of("gen_ai.invoke_agent.duration"));
        Assert.Equal("invoke_agent", agentDuration.Tags["gen_ai.operation.name"]);
        Assert.Equal("cms-media-agent", agentDuration.Tags["gen_ai.agent.name"]);
        Assert.False(agentDuration.Tags.ContainsKey("error.type"));
        Assert.Equal(2, Assert.Single(Of("gen_ai.invoke_agent.inference_calls")).Value);
        Assert.Equal(1, Assert.Single(Of("gen_ai.invoke_agent.tool_calls")).Value);
    }

    private static bool IsDescendantOf(Activity span, Activity ancestor, List<Activity> all)
    {
        var parentId = span.ParentSpanId;
        while (parentId != default)
        {
            if (parentId == ancestor.SpanId)
            {
                return true;
            }
            parentId = all.FirstOrDefault(a => a.SpanId == parentId)?.ParentSpanId ?? default;
        }
        return false;
    }

    [Fact]
    public async Task ToolLimit_LastRoundRunsWithoutTools()
    {
        var options = new AgentOptions { MaxToolRounds = 2, HeartbeatSeconds = 60 };
        var call = new FunctionCallContent("c", "list_tags", new Dictionary<string, object?>());
        _model.Round(call).Round(new FunctionCallContent("d", "list_tags", new Dictionary<string, object?>())).Text("done");

        var (_, outcome, _) = await RunAsync("Tags?", options);

        Assert.Equal("ok", outcome.Outcome);
        Assert.Equal(3, _model.Requests.Count);
        Assert.NotEmpty(_model.Requests[0].Options!.Tools!);
        Assert.True(_model.Requests[2].Options!.Tools is null || _model.Requests[2].Options!.Tools!.Count == 0);
    }

    [Fact]
    public async Task FirstRoundToolRequirement_CanBeSwitchedOff()
    {
        _model.Text("Hello.");

        await RunAsync("Hi", new AgentOptions { RequireToolOnFirstRound = false, HeartbeatSeconds = 60 });

        Assert.IsType<AutoChatToolMode>(Assert.Single(_model.Requests).Options!.ToolMode);
    }

    [Fact]
    public async Task ModelOutage_EndsWithLlmUnavailable()
    {
        _model.Fail(new HttpRequestException("connection refused"));

        var (events, outcome, traceId) = await RunAsync("How many files?");

        Assert.Equal("llm_unavailable", outcome.Outcome);
        Assert.Equal("llm_unavailable", events[^1].Data.GetProperty("code").GetString());
        Assert.True(_health.MarkedUnavailable);
        var agent = Assert.Single(Spans(traceId), s => s.DisplayName == "invoke_agent cms-media-agent");
        Assert.Equal(ActivityStatusCode.Error, agent.Status);
        Assert.Equal("llm_unavailable", agent.GetTagItem("error.type"));
        var chat = Assert.Single(Spans(traceId), s => s.DisplayName == "chat cms-agent-llm");
        Assert.NotNull(chat.GetTagItem("error.type"));
    }

    [Fact]
    public async Task CmsOutage_EndsWithCmsUnavailable()
    {
        _cms.Throw = new CmsUnavailableException("down");
        _model.Round(new FunctionCallContent("c", "list_tags", new Dictionary<string, object?>())).Text("never");

        var (events, outcome, _) = await RunAsync("Tags?");

        Assert.Equal("cms_unavailable", outcome.Outcome);
        Assert.Equal("cms_unavailable", events[^1].Data.GetProperty("code").GetString());
    }
}

public sealed class AgentEndpointTests : IClassFixture<AgentEndpointTests.AgentFactory>
{
    private readonly AgentFactory _factory;

    public AgentEndpointTests(AgentFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_ReportsModelState()
    {
        _factory.Health.Ready = false;

        var health = await _factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/agent/health");

        Assert.Equal("unavailable", health.GetProperty("llm").GetString());
        Assert.Equal("cms-agent-llm", health.GetProperty("model").GetString());
    }

    [Fact]
    public async Task Chat_InvalidRequestIs400()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/agent/chat", new { messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Chat_ModelDownIs503WithoutCallingTheModel()
    {
        _factory.Health.Ready = false;

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/agent/chat",
            new { messages = new[] { new { role = "user", content = "How many files?" } } });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("llm_unavailable", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Chat_StreamsServerSentEvents()
    {
        _factory.Health.Ready = true;
        _factory.Model.Text("Hello from the library.");

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/agent/chat",
            new { messages = new[] { new { role = "user", content = "Hi" } } });
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("event: delta", body);
        Assert.Contains("event: done", body);
    }

    public sealed class AgentFactory : WebApplicationFactory<Program>
    {
        public FakeLlmHealth Health { get; } = new();
        public ScriptedChatClient Model { get; } = new();

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("OpenTelemetry:OtlpEndpoint", string.Empty);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<LlmHealth>();
                services.AddSingleton<LlmHealth>(Health);
                services.RemoveAll<IChatClient>();
                services.AddSingleton<IChatClient>(sp => AgentChatPipeline.Build(
                    Model, NullLoggerFactory.Instance, new AgentOptions(), captureContent: false));
            });
        }
    }
}

/// <summary>Telemetry assertions use process-wide ActivitySource/Meter listeners, so nothing else may run alongside.</summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class GenAiTelemetryCollection
{
    public const string Name = "GenAI telemetry";
}
