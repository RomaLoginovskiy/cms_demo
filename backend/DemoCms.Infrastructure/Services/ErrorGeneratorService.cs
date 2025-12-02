using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DemoCms.Infrastructure.Services;

public class ErrorGeneratorService : BackgroundService
{
    private readonly ILogger<ErrorGeneratorService> _logger;
    private readonly IConfiguration _configuration;
    private readonly Random _random;
    private readonly int _minIntervalSeconds;
    private readonly int _maxIntervalSeconds;

    // Error scenarios with their properties
    private readonly List<ErrorScenario> _errorScenarios;

    public ErrorGeneratorService(ILogger<ErrorGeneratorService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
        _random = new Random();
        
        _minIntervalSeconds = configuration.GetValue<int>("ErrorGenerator:MinIntervalSeconds", 10);
        _maxIntervalSeconds = configuration.GetValue<int>("ErrorGenerator:MaxIntervalSeconds", 20);

        _errorScenarios = new List<ErrorScenario>
        {
            new ErrorScenario
            {
                Category = "Database",
                ErrorCode = "DB_001",
                Message = "Failed to connect to database",
                ExceptionType = typeof(InvalidOperationException),
                SeverityWeights = new[] { 20, 60, 20 } // Warning, Error, Critical
            },
            new ErrorScenario
            {
                Category = "Storage",
                ErrorCode = "STR_001",
                Message = "Unable to access storage location",
                ExceptionType = typeof(IOException),
                SeverityWeights = new[] { 30, 50, 20 }
            },
            new ErrorScenario
            {
                Category = "Validation",
                ErrorCode = "VAL_001",
                Message = "Invalid input data received",
                ExceptionType = typeof(ArgumentException),
                SeverityWeights = new[] { 70, 30, 0 } // Mostly warnings
            },
            new ErrorScenario
            {
                Category = "Timeout",
                ErrorCode = "TO_001",
                Message = "Operation timed out after exceeding threshold",
                ExceptionType = typeof(TimeoutException),
                SeverityWeights = new[] { 40, 50, 10 }
            },
            new ErrorScenario
            {
                Category = "Security",
                ErrorCode = "SEC_001",
                Message = "Unauthorized access attempt detected",
                ExceptionType = typeof(UnauthorizedAccessException),
                SeverityWeights = new[] { 20, 40, 40 } // More critical
            },
            new ErrorScenario
            {
                Category = "NotFound",
                ErrorCode = "NF_001",
                Message = "Requested resource not found",
                ExceptionType = typeof(FileNotFoundException),
                SeverityWeights = new[] { 50, 40, 10 }
            },
            new ErrorScenario
            {
                Category = "Network",
                ErrorCode = "NET_001",
                Message = "Network connection failed",
                ExceptionType = typeof(HttpRequestException),
                SeverityWeights = new[] { 30, 50, 20 }
            }
        };

        _logger.LogInformation("ErrorGeneratorService initialized. Will generate errors every {MinInterval}-{MaxInterval} seconds", 
            _minIntervalSeconds, _maxIntervalSeconds);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ErrorGeneratorService starting execution");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Generate random interval between min and max
                var intervalSeconds = _random.Next(_minIntervalSeconds, _maxIntervalSeconds + 1);
                await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), stoppingToken);

                // Generate random error
                GenerateRandomError();
            }
            catch (OperationCanceledException)
            {
                // Expected when service is stopping
                _logger.LogInformation("ErrorGeneratorService stopping");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in ErrorGeneratorService");
                // Continue running even if there's an error
            }
        }

        _logger.LogInformation("ErrorGeneratorService stopped");
    }

    private void GenerateRandomError()
    {
        // Select random error scenario
        var scenario = _errorScenarios[_random.Next(_errorScenarios.Count)];
        
        // Determine severity based on weights
        var severity = DetermineSeverity(scenario.SeverityWeights);
        
        // Generate correlation ID and user ID for context
        var correlationId = Guid.NewGuid().ToString();
        var userId = Guid.NewGuid().ToString();
        
        // Create exception instance
        var exception = (Exception)Activator.CreateInstance(scenario.ExceptionType, scenario.Message)!;

        // Generate additional context
        var additionalContext = new Dictionary<string, object>
        {
            ["Timestamp"] = DateTimeOffset.UtcNow,
            ["Component"] = "ErrorGenerator",
            ["RequestId"] = Guid.NewGuid().ToString(),
            ["MachineName"] = Environment.MachineName
        };

        // Log with structured properties using scope
        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["ErrorCode"] = scenario.ErrorCode,
            ["ErrorCategory"] = scenario.Category,
            ["CorrelationId"] = correlationId,
            ["UserId"] = userId,
            ["AdditionalContext"] = additionalContext
        }))
        {
            switch (severity)
            {
                case LogLevel.Warning:
                    _logger.LogWarning(exception, 
                        "[GENERATED] {ErrorCategory} warning: {Message}. ErrorCode: {ErrorCode}, CorrelationId: {CorrelationId}",
                        scenario.Category, scenario.Message, scenario.ErrorCode, correlationId);
                    break;

                case LogLevel.Error:
                    _logger.LogError(exception,
                        "[GENERATED] {ErrorCategory} error: {Message}. ErrorCode: {ErrorCode}, CorrelationId: {CorrelationId}",
                        scenario.Category, scenario.Message, scenario.ErrorCode, correlationId);
                    break;

                case LogLevel.Critical:
                    _logger.LogCritical(exception,
                        "[GENERATED] {ErrorCategory} critical error: {Message}. ErrorCode: {ErrorCode}, CorrelationId: {CorrelationId}",
                        scenario.Category, scenario.Message, scenario.ErrorCode, correlationId);
                    break;
            }
        }
    }

    private LogLevel DetermineSeverity(int[] weights)
    {
        // weights[0] = Warning, weights[1] = Error, weights[2] = Critical
        var total = weights.Sum();
        var roll = _random.Next(total);
        
        var cumulative = 0;
        for (int i = 0; i < weights.Length; i++)
        {
            cumulative += weights[i];
            if (roll < cumulative)
            {
                return i switch
                {
                    0 => LogLevel.Warning,
                    1 => LogLevel.Error,
                    2 => LogLevel.Critical,
                    _ => LogLevel.Error
                };
            }
        }
        
        return LogLevel.Error; // Fallback
    }

    private class ErrorScenario
    {
        public string Category { get; set; } = string.Empty;
        public string ErrorCode { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public Type ExceptionType { get; set; } = typeof(Exception);
        public int[] SeverityWeights { get; set; } = new[] { 40, 45, 15 }; // Default distribution
    }
}

