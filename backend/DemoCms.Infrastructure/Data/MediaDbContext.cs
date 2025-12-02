using DemoCms.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace DemoCms.Infrastructure.Data;

public class MediaDbContext : DbContext
{
    public MediaDbContext(DbContextOptions<MediaDbContext> options) : base(options)
    {
    }

    public DbSet<Media> Media { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Media>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(256);
            entity.Property(e => e.Title).HasMaxLength(256);
            entity.Property(e => e.ContentType).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Size).IsRequired();
            entity.Property(e => e.UploadedAt).IsRequired();
        });
    }
} 