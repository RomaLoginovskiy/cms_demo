using DemoCms.Agent.Telemetry;
using Microsoft.Extensions.AI;

namespace DemoCms.Agent.Chat;

public static class AgentChatPipeline
{
    /// <summary>
    /// Wraps the model client, outermost first: function invocation → round tracking → OpenTelemetry → model.
    /// OpenTelemetry sits inside the loop, so every LLM round gets its own "chat &lt;model&gt;" span, and the
    /// function invocation client picks up its ActivitySource to emit "orchestrate_tools" and
    /// "execute_tool &lt;name&gt;" spans. Message content is recorded only when <paramref name="captureContent"/> is set.
    /// </summary>
    public static IChatClient Build(IChatClient modelClient, ILoggerFactory loggerFactory, AgentOptions options, bool captureContent, Uri? endpoint = null) =>
        modelClient
            .AsBuilder()
            .UseFunctionInvocation(loggerFactory, invocation =>
            {
                // Includes the initial request; RoundTrackingChatClient sends the last one without tools.
                invocation.MaximumIterationsPerRequest = options.MaxToolRounds + 1;
                // A thrown tool exception (CMS unavailable) ends the chat; tools report other problems as results.
                invocation.MaximumConsecutiveErrorsPerRequest = 0;
                invocation.AllowConcurrentInvocation = false;
                invocation.IncludeDetailedErrors = false;
            })
            .Use(inner => new RoundTrackingChatClient(inner, options.MaxToolRounds, options.RequireToolOnFirstRound))
            .UseOpenTelemetry(loggerFactory, AgentTelemetry.GenAiSourceName, otel => otel.EnableSensitiveData = captureContent)
            // Inside the OpenTelemetry client: Activity.Current is the inference span (semconv extras + inference metrics).
            .Use(inner => new InferenceTelemetryChatClient(inner, endpoint))
            .Build();
}
