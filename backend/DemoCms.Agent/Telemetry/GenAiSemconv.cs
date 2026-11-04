using System.Diagnostics.Metrics;

namespace DemoCms.Agent.Telemetry;

/// <summary>
/// Names and instruments from the OpenTelemetry GenAI semantic conventions
/// (github.com/open-telemetry/semantic-conventions-genai, model/gen-ai, development stability, checked 2026-11-03).
/// Microsoft.Extensions.AI 10.11 already emits the inference and execute_tool spans and the older
/// gen_ai.client.token.usage / gen_ai.client.operation.duration metrics; this class adds what it does not:
/// the invoke_agent span and metrics, and the gen_ai.client.inference.* metrics.
/// </summary>
public static class GenAiSemconv
{
    // Attributes
    public const string OperationName = "gen_ai.operation.name";
    public const string ProviderName = "gen_ai.provider.name";
    public const string RequestModel = "gen_ai.request.model";
    public const string ResponseModel = "gen_ai.response.model";
    public const string RequestStream = "gen_ai.request.stream";
    public const string RequestMaxTokens = "gen_ai.request.max_tokens";
    public const string RequestTemperature = "gen_ai.request.temperature";
    public const string RequestTopP = "gen_ai.request.top_p";
    public const string ResponseFinishReasons = "gen_ai.response.finish_reasons";
    public const string ResponseTimeToFirstChunk = "gen_ai.response.time_to_first_chunk";
    public const string ConversationId = "gen_ai.conversation.id";
    public const string AgentId = "gen_ai.agent.id";
    public const string AgentName = "gen_ai.agent.name";
    public const string AgentDescription = "gen_ai.agent.description";
    public const string AgentVersion = "gen_ai.agent.version";
    public const string UsageInputTokens = "gen_ai.usage.input_tokens";
    public const string UsageOutputTokens = "gen_ai.usage.output_tokens";
    public const string TokenModality = "gen_ai.token.modality";
    public const string SystemInstructions = "gen_ai.system_instructions";
    public const string InputMessages = "gen_ai.input.messages";
    public const string OutputMessages = "gen_ai.output.messages";
    public const string ServerAddress = "server.address";
    public const string ServerPort = "server.port";
    public const string ErrorType = "error.type";

    // Values. vLLM is reached through the OpenAI-compatible API with the OpenAI client, which identifies as
    // "openai"; vLLM is not a well-known gen_ai.provider.name value.
    public const string ProviderOpenAi = "openai";
    public const string OperationChat = "chat";
    public const string OperationInvokeAgent = "invoke_agent";
    public const string ModalityText = "text";

    public const string CmsAgentId = "cms-media-agent";
    public const string CmsAgentName = "cms-media-agent";
    public const string CmsAgentDescription = "Answers questions about the CMS media library and its upload statistics (read-only).";

    // Inference metrics (one data point per model call)
    public static readonly Histogram<double> InferenceDuration = AgentTelemetry.Meter.CreateHistogram<double>(
        "gen_ai.client.inference.duration", unit: "s", description: "Duration of a GenAI inference call.");

    public static readonly Histogram<double> InferenceTimeToFirstChunk = AgentTelemetry.Meter.CreateHistogram<double>(
        "gen_ai.client.inference.time_to_first_chunk", unit: "s", description: "Time from request to the first streamed chunk.");

    public static readonly Histogram<double> InferenceTimePerOutputChunk = AgentTelemetry.Meter.CreateHistogram<double>(
        "gen_ai.client.inference.time_per_output_chunk", unit: "s", description: "Mean time between streamed chunks after the first.");

    public static readonly Counter<long> InferenceUsageInputTokens = AgentTelemetry.Meter.CreateCounter<long>(
        "gen_ai.client.inference.usage.input_tokens", unit: "{token}", description: "Input tokens used by inference calls.");

    public static readonly Counter<long> InferenceUsageOutputTokens = AgentTelemetry.Meter.CreateCounter<long>(
        "gen_ai.client.inference.usage.output_tokens", unit: "{token}", description: "Output tokens produced by inference calls.");

    public static readonly Histogram<long> InferenceOperationInputTokens = AgentTelemetry.Meter.CreateHistogram<long>(
        "gen_ai.client.inference.operation.input_tokens", unit: "{token}", description: "Input tokens per inference call.");

    public static readonly Histogram<long> InferenceOperationOutputTokens = AgentTelemetry.Meter.CreateHistogram<long>(
        "gen_ai.client.inference.operation.output_tokens", unit: "{token}", description: "Output tokens per inference call.");

    // Agent metrics (one data point per agent invocation)
    public static readonly Histogram<double> InvokeAgentDuration = AgentTelemetry.Meter.CreateHistogram<double>(
        "gen_ai.invoke_agent.duration", unit: "s", description: "Duration of an agent invocation.");

    public static readonly Histogram<long> InvokeAgentInferenceCalls = AgentTelemetry.Meter.CreateHistogram<long>(
        "gen_ai.invoke_agent.inference_calls", unit: "{inference_call}", description: "Inference calls per agent invocation.");

    public static readonly Histogram<long> InvokeAgentToolCalls = AgentTelemetry.Meter.CreateHistogram<long>(
        "gen_ai.invoke_agent.tool_calls", unit: "{tool_call}", description: "Tool calls per agent invocation.");
}
