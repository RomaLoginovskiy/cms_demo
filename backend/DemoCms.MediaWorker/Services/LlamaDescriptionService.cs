using System.Text;
using DemoCms.MediaWorker.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace DemoCms.MediaWorker.Services;

public class LlamaDescriptionService : IImageDescriptionService
{
    private readonly ChatClient _chatClient;
    private readonly OpenAiOptions _options;
    private readonly ILogger<LlamaDescriptionService> _logger;

    public LlamaDescriptionService(
        ChatClient chatClient,
        IOptions<OpenAiOptions> options,
        ILogger<LlamaDescriptionService> logger)
    {
        _chatClient = chatClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string?> GenerateDescriptionAsync(byte[] imageBytes, CancellationToken cancellationToken = default)
    {
        if (imageBytes.Length == 0)
        {
            return null;
        }

        _logger.LogInformation("Generating description using model {Model}", _options.Model);

        var prompt = string.IsNullOrWhiteSpace(_options.Prompt)
            ? "Describe the image in one sentence."
            : _options.Prompt;
        var mediaType = DetectImageMediaType(imageBytes);
        var contentParts = new[]
        {
            ChatMessageContentPart.CreateTextPart(prompt),
            ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(imageBytes), mediaType)
        };
        var messages = new[] { new UserChatMessage(contentParts) };

        try
        {
            var completion = await _chatClient.CompleteChatAsync(messages, cancellationToken: cancellationToken);
            var description = ExtractDescription(completion);
            if (!string.IsNullOrWhiteSpace(description))
            {
                _logger.LogInformation("Description generated with length {Length}", description.Length);
            }

            return description;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI request failed.");
            return null;
        }
    }

    private static string? ExtractDescription(ChatCompletion completion)
    {
        if (completion?.Content == null)
        {
            return null;
        }

        foreach (var part in completion.Content)
        {
            if (!string.IsNullOrWhiteSpace(part.Text))
            {
                return part.Text.Trim();
            }
        }

        return null;
    }

    private static string DetectImageMediaType(byte[] imageBytes)
    {
        if (imageBytes.Length >= 3
            && imageBytes[0] == 0xFF
            && imageBytes[1] == 0xD8
            && imageBytes[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (imageBytes.Length >= 8
            && imageBytes[0] == 0x89
            && imageBytes[1] == 0x50
            && imageBytes[2] == 0x4E
            && imageBytes[3] == 0x47)
        {
            return "image/png";
        }

        if (imageBytes.Length >= 6)
        {
            var header = Encoding.ASCII.GetString(imageBytes, 0, 6);
            if (header is "GIF87a" or "GIF89a")
            {
                return "image/gif";
            }
        }

        if (imageBytes.Length >= 12)
        {
            var riff = Encoding.ASCII.GetString(imageBytes, 0, 4);
            var webp = Encoding.ASCII.GetString(imageBytes, 8, 4);
            if (riff == "RIFF" && webp == "WEBP")
            {
                return "image/webp";
            }
        }

        return "image/jpeg";
    }
}
