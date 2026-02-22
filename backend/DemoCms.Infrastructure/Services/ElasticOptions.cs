public class ElasticOptions
{
    /// <summary>
    /// The base URL of the Elasticsearch cluster, e.g., https://localhost:9200
    /// </summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>
    /// Optional index name to use for media documents.
    /// </summary>
    public string IndexName { get; set; } = "media";
}
