using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace DemoCms.Agent.Telemetry;

/// <summary>
/// Telemetry names for the agent. GenAI spans and metrics ("chat cms-agent-llm", "execute_tool …",
/// gen_ai.client.*) come from Microsoft.Extensions.AI under <see cref="GenAiSourceName"/>; the agent's own
/// counters live under <see cref="SourceName"/>.
/// </summary>
public static class AgentTelemetry
{
    public const string DefaultServiceName = "demo-cms-agent";
    public const string SourceName = "DemoCms.Agent";
    public const string GenAiSourceName = "DemoCms.Agent.GenAI";

    public static readonly ActivitySource ActivitySource = new(SourceName);
    public static readonly Meter Meter = new(SourceName);

    public static readonly Counter<long> ChatRequests = Meter.CreateCounter<long>(
        "cms_agent.chat.requests", description: "Chat requests by outcome.");

    public static readonly Histogram<double> ChatDuration = Meter.CreateHistogram<double>(
        "cms_agent.chat.duration", unit: "s", description: "Wall time of a chat request, admission to last event.");

    public static readonly Counter<long> ToolInvocations = Meter.CreateCounter<long>(
        "cms_agent.tool.invocations", description: "Tool invocations by tool and outcome.");

    public static readonly Counter<long> AdmissionRejected = Meter.CreateCounter<long>(
        "cms_agent.admission.rejected", description: "Chat requests rejected before streaming, by reason.");
}
