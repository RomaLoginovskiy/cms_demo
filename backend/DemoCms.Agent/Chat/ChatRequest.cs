namespace DemoCms.Agent.Chat;

public sealed class ChatRequest
{
    public List<ChatMessageDto>? Messages { get; set; }

    /// <summary>Optional client-chosen id that groups the turns of one chat (gen_ai.conversation.id).</summary>
    public string? ConversationId { get; set; }
}

public sealed class ChatMessageDto
{
    public string? Role { get; set; }
    public string? Content { get; set; }
}

/// <summary>Request rules of POST /api/agent/chat (section 5 of the agent spec).</summary>
public static class ChatRequestValidator
{
    public static Dictionary<string, string[]> Validate(ChatRequest? request, AgentOptions options)
    {
        var errors = new Dictionary<string, string[]>();
        var messages = request?.Messages;
        if (messages is null || messages.Count == 0)
        {
            errors["messages"] = new[] { "At least one message is required." };
            return errors;
        }

        if (messages.Count > options.MaxMessages)
        {
            errors["messages"] = new[] { $"At most {options.MaxMessages} messages." };
        }

        for (var i = 0; i < messages.Count; i++)
        {
            var message = messages[i];
            var expectedRole = (messages.Count - 1 - i) % 2 == 0 ? "user" : "assistant";
            if (!string.Equals(message.Role, expectedRole, StringComparison.Ordinal))
            {
                errors[$"messages[{i}].role"] = new[] { $"Expected '{expectedRole}': roles alternate and the last message is from the user." };
            }

            var length = message.Content?.Trim().Length ?? 0;
            if (length == 0 || length > options.MaxMessageChars)
            {
                errors[$"messages[{i}].content"] = new[] { $"Must be 1 to {options.MaxMessageChars} characters." };
            }
        }

        if (request!.ConversationId is { } conversationId &&
            (conversationId.Length > 100 || !conversationId.All(c => char.IsLetterOrDigit(c) || c is '-' or '_' or '.')))
        {
            errors["conversationId"] = new[] { "At most 100 letters, digits, '-', '_' or '.'." };
        }

        var total = messages.Sum(m => m.Content?.Length ?? 0);
        if (total > options.MaxTotalChars)
        {
            errors["messages"] = new[] { $"At most {options.MaxTotalChars} characters in total." };
        }

        return errors;
    }
}
