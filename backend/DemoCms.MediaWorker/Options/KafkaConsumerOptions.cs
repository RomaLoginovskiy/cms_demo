namespace DemoCms.MediaWorker.Options;

public class KafkaConsumerOptions
{
    public string BootstrapServers { get; set; } = string.Empty;
    public string Topic { get; set; } = "media.uploaded";
    public string GroupId { get; set; } = "demo-cms-media-worker";
    public string AutoOffsetReset { get; set; } = "Earliest";
    public bool EnableAutoCommit { get; set; } = false;
}
