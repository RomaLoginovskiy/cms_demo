using System.ClientModel;
using System.ClientModel.Primitives;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;
using OpenAI;

namespace DemoCms.Agent.Chat;

/// <summary>Builds the model client for vLLM's OpenAI-compatible API.</summary>
public static class LlmClientFactory
{
    public static IChatClient Create(LlmOptions llm, PipelineTransport? transport = null)
    {
        var options = new OpenAIClientOptions
        {
            Endpoint = new Uri(llm.BaseUrl),
            NetworkTimeout = TimeSpan.FromSeconds(llm.CallTimeoutSeconds),
            RetryPolicy = new ClientRetryPolicy(maxRetries: 0)
        };
        if (transport is not null)
        {
            options.Transport = transport;
        }
        if (llm.DisableThinking)
        {
            options.AddPolicy(new DisableThinkingPolicy(), PipelinePosition.PerCall);
        }

        return new OpenAIClient(new ApiKeyCredential(llm.ApiKey), options).GetChatClient(llm.Model).AsIChatClient();
    }
}

/// <summary>
/// Adds <c>"chat_template_kwargs": {"enable_thinking": false}</c> to every chat completion request. vLLM passes
/// it to the model's chat template; for Qwen3 that turns reasoning off in every round. The <c>/no_think</c> soft
/// switch in the system prompt did not stop it after a tool result (S1: 106 of 122 answer tokens were reasoning).
/// The OpenAI SDK has no typed field for this vLLM extension, so the JSON body is amended on the way out.
/// </summary>
public sealed class DisableThinkingPolicy : PipelinePolicy
{
    public override void Process(PipelineMessage message, IReadOnlyList<PipelinePolicy> pipeline, int currentIndex)
    {
        Amend(message);
        ProcessNext(message, pipeline, currentIndex);
    }

    public override async ValueTask ProcessAsync(PipelineMessage message, IReadOnlyList<PipelinePolicy> pipeline, int currentIndex)
    {
        Amend(message);
        await ProcessNextAsync(message, pipeline, currentIndex);
    }

    private static void Amend(PipelineMessage message)
    {
        var request = message.Request;
        if (!string.Equals(request.Method, "POST", StringComparison.OrdinalIgnoreCase)
            || request.Uri?.AbsolutePath.EndsWith("/chat/completions", StringComparison.Ordinal) != true
            || request.Content is null)
        {
            return;
        }

        using var buffer = new MemoryStream();
        request.Content.WriteTo(buffer, message.CancellationToken);
        if (JsonNode.Parse(buffer.ToArray()) is not JsonObject body)
        {
            return;
        }

        var kwargs = body["chat_template_kwargs"] as JsonObject ?? new JsonObject();
        kwargs["enable_thinking"] = false;
        body["chat_template_kwargs"] = kwargs;
        request.Content = BinaryContent.Create(BinaryData.FromString(body.ToJsonString()));
    }
}
