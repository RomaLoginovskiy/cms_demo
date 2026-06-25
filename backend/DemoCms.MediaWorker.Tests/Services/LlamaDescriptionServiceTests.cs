using DemoCms.MediaWorker.Options;
using DemoCms.MediaWorker.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;
using System.ClientModel;
using Xunit;

namespace DemoCms.MediaWorker.Tests.Services;

public class LlamaDescriptionServiceTests
{
    [Fact]
    public async Task GenerateDescriptionAsync_ReturnsNullForEmptyImage()
    {
        var service = CreateService();

        var result = await service.GenerateDescriptionAsync([]);

        Assert.Null(result);
    }

    private static LlamaDescriptionService CreateService()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new OpenAiOptions { BaseUrl = "http://localhost:11434/v1", ApiKey = "test", Model = "test" });
        var clientOptions = new OpenAIClientOptions { Endpoint = new Uri(options.Value.BaseUrl) };
        var credential = new ApiKeyCredential(options.Value.ApiKey);
        var chatClient = new ChatClient(options.Value.Model, credential, clientOptions);

        return new LlamaDescriptionService(chatClient, options, NullLogger<LlamaDescriptionService>.Instance);
    }
}
