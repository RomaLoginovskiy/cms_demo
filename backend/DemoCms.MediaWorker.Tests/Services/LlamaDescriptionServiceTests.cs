using DemoCms.MediaWorker.Options;
using DemoCms.MediaWorker.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;
using System.ClientModel;
using System.ClientModel.Primitives;
using System.Net;
using Xunit;

namespace DemoCms.MediaWorker.Tests.Services;

public class LlamaDescriptionServiceTests
{
    private static readonly byte[] PngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    [Fact]
    public async Task GenerateDescriptionAsync_ReturnsNullForEmptyImage()
    {
        var service = CreateService();

        var result = await service.GenerateDescriptionAsync([]);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateDescriptionAsync_SkipsPlaceholderEndpointWithoutRequest()
    {
        var handler = new CountingHandler();
        var logger = new CapturingLogger<LlamaDescriptionService>();
        var service = CreateService("http://llm.invalid/v1", handler, logger);

        var result = await service.GenerateDescriptionAsync(PngHeader);

        Assert.Null(result);
        Assert.Equal(0, handler.Calls);
        Assert.Single(logger.Entries, e => e.Level == LogLevel.Warning && e.Message.Contains("Captioning disabled"));
        Assert.DoesNotContain(logger.Entries, e => e.Level == LogLevel.Error);
    }

    [Fact]
    public async Task GenerateDescriptionAsync_CallsConfiguredEndpoint()
    {
        var handler = new CountingHandler();
        var logger = new CapturingLogger<LlamaDescriptionService>();
        var service = CreateService("http://localhost:11434/v1", handler, logger);

        var result = await service.GenerateDescriptionAsync(PngHeader);

        Assert.Null(result);
        Assert.Equal(1, handler.Calls);
        Assert.Contains(logger.Entries, e => e.Level == LogLevel.Error);
    }

    [Theory]
    [InlineData("http://llm.invalid/v1", true)]
    [InlineData("https://LLM.INVALID", true)]
    [InlineData("http://localhost:11434/v1", false)]
    [InlineData("https://api.openai.com/v1", false)]
    [InlineData("", false)]
    public void IsPlaceholderEndpoint_RecognisesInvalidTld(string baseUrl, bool expected)
    {
        var options = new OpenAiOptions { BaseUrl = baseUrl };

        Assert.Equal(expected, options.IsPlaceholderEndpoint);
    }

    private static LlamaDescriptionService CreateService(
        string baseUrl = "http://localhost:11434/v1",
        HttpMessageHandler? handler = null,
        ILogger<LlamaDescriptionService>? logger = null)
    {
        var options = Microsoft.Extensions.Options.Options.Create(new OpenAiOptions { BaseUrl = baseUrl, ApiKey = "test", Model = "test" });
        var clientOptions = new OpenAIClientOptions
        {
            Endpoint = new Uri(options.Value.BaseUrl),
            RetryPolicy = new ClientRetryPolicy(maxRetries: 0)
        };
        if (handler != null)
        {
            clientOptions.Transport = new HttpClientPipelineTransport(new HttpClient(handler));
        }

        var credential = new ApiKeyCredential(options.Value.ApiKey);
        var chatClient = new ChatClient(options.Value.Model, credential, clientOptions);

        return new LlamaDescriptionService(chatClient, options, logger ?? NullLogger<LlamaDescriptionService>.Instance);
    }

    private sealed class CountingHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        }
    }

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }
}
