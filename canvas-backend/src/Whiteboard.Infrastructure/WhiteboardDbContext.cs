using Microsoft.EntityFrameworkCore;
using Whiteboard.Domain;

namespace Whiteboard.Infrastructure;

public sealed class WhiteboardDbContext(DbContextOptions<WhiteboardDbContext> options) : DbContext(options)
{
    public DbSet<Board> Boards => Set<Board>();

    public DbSet<Shape> Shapes => Set<Shape>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureBoard(modelBuilder);
        ConfigureShape(modelBuilder);
    }

    private static void ConfigureBoard(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Board>(board =>
        {
            board.HasKey(item => item.Id);
            board.Property(item => item.Name).HasMaxLength(200).IsRequired();
            board.Property(item => item.CreatedAt).IsRequired();
            board.Property(item => item.UpdatedAt).IsRequired();
        });
    }

    private static void ConfigureShape(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Shape>(shape =>
        {
            shape.HasKey(item => item.Id);
            shape.Property(item => item.Type).HasConversion<string>().HasMaxLength(32).IsRequired();
            shape.Property(item => item.Fill).HasMaxLength(32).IsRequired();
            shape.Property(item => item.Stroke).HasMaxLength(32).IsRequired();
            shape.Property(item => item.Text).HasMaxLength(4000);
            shape.Property(item => item.ImageUrl).HasMaxLength(2048);
            shape.Property(item => item.AltText).HasMaxLength(500);
            shape.Property(item => item.TemplateId).HasMaxLength(64);
            shape.Property(item => item.UpdatedAt).IsRequired();

            shape.HasOne(item => item.Board)
                .WithMany(board => board.Shapes)
                .HasForeignKey(item => item.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
