using System.Diagnostics;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using DemoCms.Agent.Cms;
using DemoCms.Agent.Telemetry;
using Microsoft.Extensions.AI;

namespace DemoCms.Agent.Tools;

/// <summary>
/// An AI function with a hand-written JSON schema (the contract in section 6 of the agent spec) and a
/// handler that returns plain objects. Results are serialised compactly and capped in size.
/// Microsoft.Extensions.AI wraps each call in an "execute_tool &lt;name&gt;" span; this class adds the outcome.
/// </summary>
public sealed class CmsTool : AIFunction
{
    public static readonly JsonSerializerOptions ResultJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly Func<ToolArgs, CancellationToken, Task<object>> _handler;

    public CmsTool(string name, string description, string jsonSchema, Func<ToolArgs, CancellationToken, Task<object>> handler)
    {
        Name = name;
        Description = description;
        using var document = JsonDocument.Parse(jsonSchema);
        JsonSchema = document.RootElement.Clone();
        _handler = handler;
    }

    public override string Name { get; }

    public override string Description { get; }

    public override JsonElement JsonSchema { get; }

    protected override async ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken)
    {
        var outcome = "ok";
        try
        {
            object result;
            try
            {
                result = await _handler(new ToolArgs(arguments), cancellationToken);
            }
            catch (CmsBadRequestException ex)
            {
                result = new { error = "invalid_argument", details = ex.Errors };
            }

            outcome = OutcomeOf(result);
            return JsonSerializer.SerializeToElement(result, ResultJsonOptions);
        }
        catch (CmsUnavailableException)
        {
            outcome = "cms_unavailable";
            throw;
        }
        catch (OperationCanceledException)
        {
            outcome = "cancelled";
            throw;
        }
        finally
        {
            Activity.Current?.SetTag("cms_agent.tool.outcome", outcome);
            if (DemoCms.Agent.Chat.ChatRunContext.Current?.ConversationId is { } conversationId)
            {
                Activity.Current?.SetTag(GenAiSemconv.ConversationId, conversationId);
            }
            AgentTelemetry.ToolInvocations.Add(1,
                new KeyValuePair<string, object?>("tool", Name),
                new KeyValuePair<string, object?>("outcome", outcome));
        }
    }

    private static string OutcomeOf(object result)
    {
        var errorProperty = result.GetType().GetProperty("error");
        return errorProperty?.GetValue(result) as string ?? "ok";
    }
}
