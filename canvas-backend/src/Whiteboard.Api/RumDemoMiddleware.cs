namespace Whiteboard.Api;

public static class RumDemoMiddlewareExtensions
{
    private const int SlowApiDelayMs = 3500;

    public static WebApplication UseRumDemo(this WebApplication app)
    {
        var enabled = string.Equals(
            app.Configuration["RUM_DEMO_ENABLED"],
            "true",
            StringComparison.OrdinalIgnoreCase);

        if (!enabled)
        {
            return app;
        }

        app.MapGet("/api/demo/rum/health", () => Results.Ok(new { demoEnabled = true }));

        app.MapGet("/api/demo/rum/chunk/{name}", (string name) =>
            Results.NotFound(new { error = "chunk_missing", chunk = name }));

        app.Use(async (context, next) =>
        {
            var demoHeader = context.Request.Headers["X-Rum-Demo"].ToString();
            var path = context.Request.Path.Value ?? string.Empty;

            if (demoHeader.Equals("slow-api", StringComparison.OrdinalIgnoreCase)
                && path.StartsWith("/api/boards", StringComparison.OrdinalIgnoreCase))
            {
                await Task.Delay(SlowApiDelayMs, context.RequestAborted);
            }

            if (demoHeader.Equals("fail-next", StringComparison.OrdinalIgnoreCase)
                && path.StartsWith("/api/boards", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                await context.Response.WriteAsJsonAsync(new { error = "rum_demo_fail_next" });
                return;
            }

            await next();
        });

        return app;
    }
}
