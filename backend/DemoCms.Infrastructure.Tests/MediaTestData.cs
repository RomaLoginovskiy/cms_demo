using DemoCms.Core.Models;
using DemoCms.Infrastructure.Data;

namespace DemoCms.Infrastructure.Tests;

/// <summary>
/// Fixed media library used by the query tests. "Now" is Monday 2026-11-02 10:00 UTC (ISO week 45).
/// </summary>
internal static class MediaTestData
{
    public static readonly DateTimeOffset Now = new(2026, 11, 2, 10, 0, 0, TimeSpan.Zero);

    public static readonly Guid AlpsId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid BeachId = Guid.Parse("00000000-0000-0000-0000-000000000002");
    public static readonly Guid ReportId = Guid.Parse("00000000-0000-0000-0000-000000000003");
    public static readonly Guid NotesId = Guid.Parse("00000000-0000-0000-0000-000000000004");
    public static readonly Guid LogoId = Guid.Parse("00000000-0000-0000-0000-000000000005");
    public static readonly Guid ArchiveId = Guid.Parse("00000000-0000-0000-0000-000000000006");

    public const long TotalBytes = 4_980_736 + 1_048_576 + 10_240 + 2_048 + 51_200 + 300_000;

    public static void Seed(MediaDbContext context)
    {
        var tags = new Dictionary<string, Tag>();
        Tag TagNamed(string name) => tags.TryGetValue(name, out var tag) ? tag : tags[name] = new Tag { Name = name, CreatedAt = Now };

        void Add(Guid id, string fileName, string title, string contentType, long size, DateTimeOffset uploadedAt, string? description, params string[] tagNames)
        {
            var media = new Media
            {
                Id = id,
                FileName = fileName,
                Title = title,
                Description = description,
                ContentType = contentType,
                Size = size,
                UploadedAt = uploadedAt
            };
            foreach (var name in tagNames)
            {
                media.MediaTags.Add(new MediaTag { Media = media, Tag = TagNamed(name) });
            }
            context.Media.Add(media);
        }

        Add(AlpsId, "alps.jpg", "Alps panorama", "image/jpeg", 4_980_736, At(2026, 10, 26, 8, 0, 0), null, "nature", "mountains");
        Add(BeachId, "beach.png", "Beach", "image/png", 1_048_576, At(2026, 10, 28, 12, 0, 0), null, "nature");
        Add(ReportId, "q3-report.csv", "Report", "text/csv", 10_240, At(2026, 10, 31, 23, 59, 59), null, "finance");
        Add(NotesId, "notes.txt", "Notes", "text/plain", 2_048, At(2026, 11, 1, 0, 0, 0), "Meeting notes about the alpine trip");
        Add(LogoId, "logo.webp", "Logo", "image/webp", 51_200, At(2026, 11, 2, 9, 0, 0), null, "brand");
        Add(ArchiveId, "old.gif", "Archive photo", "image/gif", 300_000, At(2026, 9, 15, 10, 0, 0), null, "nature");

        context.SaveChanges();
    }

    private static DateTimeOffset At(int year, int month, int day, int hour, int minute, int second) =>
        new(year, month, day, hour, minute, second, TimeSpan.Zero);
}

internal sealed class FixedTimeProvider : TimeProvider
{
    private readonly DateTimeOffset _now;

    public FixedTimeProvider(DateTimeOffset now) => _now = now;

    public override DateTimeOffset GetUtcNow() => _now;
}
