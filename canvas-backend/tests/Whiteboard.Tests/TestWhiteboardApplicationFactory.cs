using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Whiteboard.Infrastructure;

namespace Whiteboard.Tests;

internal sealed class TestWhiteboardApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databasePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.db");

    public string DatabasePath => _databasePath;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<WhiteboardDbContext>>();
            services.AddDbContext<WhiteboardDbContext>(options => options.UseSqlite(CreateConnectionString()));
        });
    }

    private string CreateConnectionString() => $"Data Source={_databasePath}";

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        File.Delete(_databasePath);
    }
}
