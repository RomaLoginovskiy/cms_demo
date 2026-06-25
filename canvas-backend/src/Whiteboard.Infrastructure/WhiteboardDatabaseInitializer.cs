using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Whiteboard.Infrastructure;

public static class WhiteboardDatabaseInitializer
{
    private const string DefaultConnectionString = "Data Source=data/whiteboard.db";

    public static async Task InitializeAsync(
        IServiceProvider services,
        IConfiguration configuration,
        CancellationToken ct = default)
    {
        EnsureDatabaseDirectory(configuration);

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WhiteboardDbContext>();

        await ApplySchemaAsync(db, ct);
        await DbInitializer.SeedAsync(db, ct);
    }

    private static async Task ApplySchemaAsync(WhiteboardDbContext db, CancellationToken ct)
    {
        if (db.Database.GetMigrations().Any())
        {
            await db.Database.MigrateAsync(ct);
            return;
        }

        await db.Database.EnsureCreatedAsync(ct);
    }

    private static void EnsureDatabaseDirectory(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Sqlite") ?? DefaultConnectionString;
        var path = new SqliteConnectionStringBuilder(connectionString).DataSource;

        if (string.IsNullOrWhiteSpace(path) || path is ":memory:")
        {
            return;
        }

        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }
}
