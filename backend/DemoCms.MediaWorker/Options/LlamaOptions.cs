namespace DemoCms.MediaWorker.Options;

public class LlamaOptions
{
    public string BaseUrl { get; set; } = "http://localhost:11434";
    public string EndpointPath { get; set; } = "/api/generate";
    public string Model { get; set; } = "llama3.2-vision";
    public string Prompt { get; set; } = "Describe the image in one sentence.";
}
