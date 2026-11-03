using System.ClientModel.Primitives;
using System.Net;
using System.Text;
using System.Text.Json;
using DemoCms.Agent.Chat;
using Microsoft.Extensions.AI;
using Xunit;

namespace DemoCms.Agent.Tests;

public sealed class LlmClientFactoryTests
{
    private const string CompletionJson = """
        {"id":"chatcmpl-1","object":"chat.completion","created":1,"model":"cms-agent-llm",
         "choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],
         "usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}
        """;

    private static async Task<JsonElement> SendAsync(bool disableThinking)
    {
        var handler = new CapturingHandler();
        var client = LlmClientFactory.Create(
            new LlmOptions { BaseUrl = "http://vllm.test:8000/v1", Model = "cms-agent-llm", DisableThinking = disableThinking },
            new HttpClientPipelineTransport(new HttpClient(handler)));

        var response = await client.GetResponseAsync(
            new[] { new ChatMessage(ChatRole.User, "How many files?") },
            new ChatOptions { Temperature = 0.3f });

        Assert.Equal("ok", response.Text);
        Assert.EndsWith("/v1/chat/completions", handler.Uri!.AbsolutePath);
        return JsonDocument.Parse(handler.Body!).RootElement.Clone();
    }

    [Fact]
    public async Task DisableThinking_AddsChatTemplateKwargsAndKeepsTheRequest()
    {
        var body = await SendAsync(disableThinking: true);

        Assert.False(body.GetProperty("chat_template_kwargs").GetProperty("enable_thinking").GetBoolean());
        Assert.Equal("cms-agent-llm", body.GetProperty("model").GetString());
        Assert.Equal("How many files?", body.GetProperty("messages")[0].GetProperty("content").GetString());
        Assert.Equal(0.3, body.GetProperty("temperature").GetDouble(), 3);
    }

    [Fact]
    public async Task ThinkingAllowed_SendsNoChatTemplateKwargs()
    {
        var body = await SendAsync(disableThinking: false);

        Assert.False(body.TryGetProperty("chat_template_kwargs", out _));
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        public Uri? Uri { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Uri = request.RequestUri;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(CompletionJson, Encoding.UTF8, "application/json")
            };
        }
    }
}
