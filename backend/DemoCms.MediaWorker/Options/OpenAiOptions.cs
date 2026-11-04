namespace DemoCms.MediaWorker.Options;

public class OpenAiOptions
{
    public string BaseUrl { get; set; } = "http://localhost:11434/v1";
    public string ApiKey { get; set; } = "ollama";
    public string Model { get; set; } = "llama3.2-vision";
    public string Prompt { get; set; } = "Describe the image in one sentence.";

    // Terraform writes http://llm.invalid/v1 until a captioning endpoint is chosen (Q5).
    // The .invalid TLD never resolves (RFC 2606), so a request there can only fail.
    public bool IsPlaceholderEndpoint =>
        Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri)
        && uri.Host.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase);
}
