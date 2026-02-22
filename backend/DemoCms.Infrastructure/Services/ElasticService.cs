using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;

namespace DemoCms.Infrastructure.Services
{
    public interface IElasticService
    {
        Task IndexDocumentAsync(MediaDocument doc, CancellationToken cancellationToken = default);
    }

    public class ElasticService : IElasticService
    {
        private readonly HttpClient _client;
        private readonly string _index;

        public ElasticService(HttpClient client, IOptions<ElasticOptions> options)
        {
            _client = client;
            _index = options.Value.IndexName;
        }

        public async Task IndexDocumentAsync(MediaDocument doc, CancellationToken cancellationToken = default)
        {
            var json = JsonSerializer.Serialize(doc);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_index}/_doc/{doc.Id}", content, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
    }

    public class MediaDocument
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public IEnumerable<string>? Tags { get; set; }
        public DateTimeOffset UploadedAt { get; set; }
    }
}
