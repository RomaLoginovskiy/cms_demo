namespace DemoCms.MediaWorker.Options;

public class OpenAiOptions
{
    public string BaseUrl { get; set; } = "http://localhost:11434/v1";
    public string ApiKey { get; set; } = "ollama";
    public string Model { get; set; } = "llama3.2-vision";
    public string Prompt { get; set; } = "Describe the image in one sentence.";
}
