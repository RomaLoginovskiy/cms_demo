using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using DemoCms.MediaWorker.Options;
using DemoCms.MediaWorker.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace DemoCms.MediaWorker.Tests.Services;

public class LlamaDescriptionServiceTests
{
    [Fact]
    public async Task GenerateDescriptionAsync_ReturnsResponseText()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, "{\"response\":\"A cat on a sofa.\"}");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var options = Options.Create(new LlamaOptions { BaseUrl = "http://localhost:11434", EndpointPath = "/api/generate" });
        var service = new LlamaDescriptionService(httpClient, options, NullLogger<LlamaDescriptionService>.Instance);

        var result = await service.GenerateDescriptionAsync(new byte[] { 1, 2, 3 });

        Assert.Equal("A cat on a sofa.", result);
    }

    [Fact]
    public async Task GenerateDescriptionAsync_ReturnsNullOnFailure()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.BadRequest, "{\"error\":\"bad request\"}");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var options = Options.Create(new LlamaOptions { BaseUrl = "http://localhost:11434", EndpointPath = "/api/generate" });
        var service = new LlamaDescriptionService(httpClient, options, NullLogger<LlamaDescriptionService>.Instance);

        var result = await service.GenerateDescriptionAsync(new byte[] { 1, 2, 3 });

        Assert.Null(result);
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _statusCode;
        private readonly string _body;

        public StubHttpMessageHandler(HttpStatusCode statusCode, string body)
        {
            _statusCode = statusCode;
            _body = body;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(_statusCode)
            {
                Content = new StringContent(_body, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }
}
