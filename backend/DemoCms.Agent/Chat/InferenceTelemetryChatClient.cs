using System.Diagnostics;
using System.Runtime.CompilerServices;
using DemoCms.Agent.Telemetry;
using Microsoft.Extensions.AI;

namespace DemoCms.Agent.Chat;

/// <summary>
/// Sits directly inside Microsoft.Extensions.AI's OpenTelemetryChatClient, so Activity.Current is the
/// "chat {model}" inference span. Adds the semconv attributes that client does not set (gen_ai.request.stream,
/// gen_ai.response.time_to_first_chunk, gen_ai.conversation.id) and records the gen_ai.client.inference.* metrics.
/// </summary>
public sealed class InferenceTelemetryChatClient : DelegatingChatClient
{
    private readonly string? _serverAddress;
    private readonly int? _serverPort;

    public InferenceTelemetryChatClient(IChatClient innerClient, Uri? endpoint) : base(innerClient)
    {
        _serverAddress = endpoint?.Host;
        _serverPort = endpoint?.Port;
    }

    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var started = Stopwatch.GetTimestamp();
        Tag(Activity.Current, stream: false);
        string? errorType = null;
        ChatResponse? response = null;
        try
        {
            response = await base.GetResponseAsync(messages, options, cancellationToken);
            return response;
        }
        catch (Exception ex)
        {
            errorType = ex.GetType().FullName;
            throw;
        }
        finally
        {
            Record(options, response?.ModelId, Stopwatch.GetElapsedTime(started), firstChunk: null, chunks: 0,
                response?.Usage?.InputTokenCount, response?.Usage?.OutputTokenCount, errorType);
        }
    }

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var activity = Activity.Current;
        var started = Stopwatch.GetTimestamp();
        Tag(activity, stream: true);

        TimeSpan? firstChunk = null;
        var chunks = 0;
        string? responseModel = null;
        long? inputTokens = null, outputTokens = null;
        string? errorType = "cancelled";

        try
        {
            await using var enumerator = base.GetStreamingResponseAsync(messages, options, cancellationToken).GetAsyncEnumerator(cancellationToken);
            while (true)
            {
                bool hasNext;
                try
                {
                    hasNext = await enumerator.MoveNextAsync();
                }
                catch (Exception ex)
                {
                    errorType = ex.GetType().FullName;
                    throw;
                }

                if (!hasNext)
                {
                    break;
                }

                var update = enumerator.Current;
                if (firstChunk is null)
                {
                    firstChunk = Stopwatch.GetElapsedTime(started);
                    activity?.SetTag(GenAiSemconv.ResponseTimeToFirstChunk, firstChunk.Value.TotalSeconds);
                }

                chunks++;
                responseModel ??= update.ModelId;
                foreach (var usage in update.Contents.OfType<UsageContent>())
                {
                    inputTokens = (inputTokens ?? 0) + (usage.Details.InputTokenCount ?? 0);
                    outputTokens = (outputTokens ?? 0) + (usage.Details.OutputTokenCount ?? 0);
                }

                yield return update;
            }

            errorType = null;
        }
        finally
        {
            Record(options, responseModel, Stopwatch.GetElapsedTime(started), firstChunk, chunks, inputTokens, outputTokens, errorType);
        }
    }

    private static void Tag(Activity? activity, bool stream)
    {
        if (activity is null)
        {
            return;
        }

        activity.SetTag(GenAiSemconv.RequestStream, stream);
        if (ChatRunContext.Current?.ConversationId is { } conversationId)
        {
            activity.SetTag(GenAiSemconv.ConversationId, conversationId);
        }
    }

    private void Record(ChatOptions? options, string? responseModel, TimeSpan duration, TimeSpan? firstChunk, int chunks,
        long? inputTokens, long? outputTokens, string? errorType)
    {
        var tags = new TagList
        {
            { GenAiSemconv.OperationName, GenAiSemconv.OperationChat },
            { GenAiSemconv.ProviderName, GenAiSemconv.ProviderOpenAi }
        };
        if (options?.ModelId is { } requestModel)
        {
            tags.Add(GenAiSemconv.RequestModel, requestModel);
        }
        if (responseModel is not null)
        {
            tags.Add(GenAiSemconv.ResponseModel, responseModel);
        }
        if (_serverAddress is not null)
        {
            tags.Add(GenAiSemconv.ServerAddress, _serverAddress);
            tags.Add(GenAiSemconv.ServerPort, _serverPort);
        }
        if (errorType is not null)
        {
            tags.Add(GenAiSemconv.ErrorType, errorType);
        }

        GenAiSemconv.InferenceDuration.Record(duration.TotalSeconds, tags);
        if (firstChunk is { } ttfc)
        {
            GenAiSemconv.InferenceTimeToFirstChunk.Record(ttfc.TotalSeconds, tags);
            if (chunks > 1)
            {
                GenAiSemconv.InferenceTimePerOutputChunk.Record((duration - ttfc).TotalSeconds / (chunks - 1), tags);
            }
        }

        var tokenTags = tags;
        tokenTags.Add(GenAiSemconv.TokenModality, GenAiSemconv.ModalityText);
        if (inputTokens is { } input)
        {
            GenAiSemconv.InferenceUsageInputTokens.Add(input, tokenTags);
            GenAiSemconv.InferenceOperationInputTokens.Record(input, tags);
        }
        if (outputTokens is { } output)
        {
            GenAiSemconv.InferenceUsageOutputTokens.Add(output, tokenTags);
            GenAiSemconv.InferenceOperationOutputTokens.Record(output, tags);
        }
    }
}
