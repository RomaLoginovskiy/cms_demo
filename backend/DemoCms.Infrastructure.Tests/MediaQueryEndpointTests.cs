using System.Net;
using System.Text.Json;
using DemoCms.Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace DemoCms.Infrastructure.Tests;

public sealed class MediaQueryEndpointTests : IClassFixture<MediaQueryEndpointTests.ApiFactory>
{
    private readonly HttpClient _client;

    public MediaQueryEndpointTests(ApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Search_ReturnsPagedCamelCaseJson()
    {
        using var json = await GetJsonAsync("/api/media/search?pageSize=2&sort=size_desc", HttpStatusCode.OK);

        var root = json.RootElement;
        Assert.Equal(6, root.GetProperty("total").GetInt32());
        Assert.Equal(2, root.GetProperty("pageSize").GetInt32());
        Assert.Equal("Alps panorama", root.GetProperty("items")[0].GetProperty("title").GetString());
        Assert.Equal(2, root.GetProperty("items")[0].GetProperty("tags").GetArrayLength());
    }

    [Fact]
    public async Task Stats_ReturnsContractShape()
    {
        using var json = await GetJsonAsync("/api/media/stats?groupBy=tag&contentType=image/*", HttpStatusCode.OK);

        var root = json.RootElement;
        Assert.Equal("tag", root.GetProperty("groupBy").GetString());
        Assert.Equal("image", root.GetProperty("filters").GetProperty("contentType").GetString());
        Assert.Equal("any", root.GetProperty("filters").GetProperty("tagMatch").GetString());
        Assert.Equal(4, root.GetProperty("totals").GetProperty("count").GetInt32());
        Assert.Equal("nature", root.GetProperty("groups")[0].GetProperty("key").GetString());
        Assert.False(root.GetProperty("groupsTruncated").GetBoolean());
    }

    [Fact]
    public async Task Search_InvalidParameterReturnsValidationProblem()
    {
        using var json = await GetJsonAsync("/api/media/search?sort=newest&pageSize=500", HttpStatusCode.BadRequest);

        var errors = json.RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("sort", out _));
        Assert.True(errors.TryGetProperty("pageSize", out _));
    }

    [Fact]
    public async Task Stats_TooManyBucketsReturnsValidationProblem()
    {
        using var json = await GetJsonAsync("/api/media/stats?groupBy=day&from=2020-01-01", HttpStatusCode.BadRequest);

        Assert.True(json.RootElement.GetProperty("errors").TryGetProperty("groupBy", out _));
    }

    [Fact]
    public async Task IdRoutesOnlyMatchGuids()
    {
        var response = await _client.GetAsync("/api/media/not-a-guid");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ExistingRoutesStillWork()
    {
        var byId = await _client.GetAsync($"/api/media/{MediaTestData.AlpsId}");
        var tags = await _client.GetAsync("/api/media/tags");

        Assert.Equal(HttpStatusCode.OK, byId.StatusCode);
        Assert.Equal(HttpStatusCode.OK, tags.StatusCode);
    }

    private async Task<JsonDocument> GetJsonAsync(string url, HttpStatusCode expectedStatus)
    {
        var response = await _client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expectedStatus, $"{url} returned {(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body);
    }

    public sealed class ApiFactory : WebApplicationFactory<Program>
    {
        private readonly string _directory = Path.Combine(Path.GetTempPath(), "democms-tests-" + Guid.NewGuid().ToString("N"));

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Directory.CreateDirectory(_directory);
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={Path.Combine(_directory, "media.db")}");
            builder.UseSetting("Storage:Path", Path.Combine(_directory, "uploads"));
            builder.UseSetting("OpenTelemetry:OtlpEndpoint", string.Empty);
            builder.UseSetting("OpenTelemetry:EnablePrometheusExporter", "false");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(new FixedTimeProvider(MediaTestData.Now));
            });
        }

        protected override void ConfigureClient(HttpClient client)
        {
            base.ConfigureClient(client);
            using var scope = Services.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<MediaDbContext>();
            if (!context.Media.Any())
            {
                MediaTestData.Seed(context);
            }
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            try
            {
                Directory.Delete(_directory, recursive: true);
            }
            catch (IOException)
            {
                // SQLite may still hold the file briefly; the temp directory is disposable.
            }
        }
    }
}
