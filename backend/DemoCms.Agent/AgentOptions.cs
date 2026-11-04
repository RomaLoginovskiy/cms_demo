namespace DemoCms.Agent;

/// <summary>Where the read-only CMS API lives (section 9 of spec/components/cms-media-agent.md).</summary>
public sealed class CmsOptions
{
    public string BaseUrl { get; set; } = "http://cms-backend:8080";
    public int TimeoutSeconds { get; set; } = 5;
}

/// <summary>OpenAI-compatible endpoint served by vLLM under the model alias "cms-agent-llm".</summary>
public sealed class LlmOptions
{
    public string BaseUrl { get; set; } = "http://vllm.llm.svc.cluster.local:8000/v1";
    public string Model { get; set; } = "cms-agent-llm";
    public string ApiKey { get; set; } = "none";
    public bool DisableThinking { get; set; } = true;
    public float Temperature { get; set; } = 0.3f;
    public float TopP { get; set; } = 0.8f;
    public int MaxOutputTokens { get; set; } = 600;
    public int CallTimeoutSeconds { get; set; } = 45;
    public int HealthCacheSeconds { get; set; } = 15;
}

/// <summary>Bound from the "OpenTelemetry" section.</summary>
public sealed class AgentTelemetryOptions
{
    /// <summary>Opt-in GenAI content attributes (prompts, answers, tool payloads). Local debugging only.</summary>
    public bool CaptureMessageContent { get; set; }
}

public sealed class AgentOptions
{
    public int MaxToolRounds { get; set; } = 4;

    /// <summary>
    /// Sends the first round with tool_choice "required". Small CPU models (Qwen3-0.6B in S1) otherwise answer
    /// count questions from thin air or write a tool name as text instead of calling it.
    /// </summary>
    public bool RequireToolOnFirstRound { get; set; } = true;
    public int RequestTimeoutSeconds { get; set; } = 90;
    public int MaxConcurrentChats { get; set; } = 4;
    public int QueueLimit { get; set; } = 4;
    public int RateLimitPerMinute { get; set; } = 10;
    public int HeartbeatSeconds { get; set; } = 15;
    public int MaxMessages { get; set; } = 12;
    public int MaxMessageChars { get; set; } = 2000;
    public int MaxTotalChars { get; set; } = 8000;
    public int ToolResultMaxChars { get; set; } = 6000;
}
