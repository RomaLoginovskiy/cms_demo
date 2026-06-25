using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Infrastructure.Migrations;

[DbContext(typeof(WhiteboardDbContext))]
[Migration("20260525113000_InitialCreate")]
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Boards",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "TEXT", nullable: false),
                Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_Boards", x => x.Id));

        migrationBuilder.CreateTable(
            name: "Shapes",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "TEXT", nullable: false),
                BoardId = table.Column<Guid>(type: "TEXT", nullable: false),
                Type = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                X = table.Column<double>(type: "REAL", nullable: false),
                Y = table.Column<double>(type: "REAL", nullable: false),
                Width = table.Column<double>(type: "REAL", nullable: false),
                Height = table.Column<double>(type: "REAL", nullable: false),
                EndX = table.Column<double>(type: "REAL", nullable: true),
                EndY = table.Column<double>(type: "REAL", nullable: true),
                Fill = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                Stroke = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                StrokeWidth = table.Column<double>(type: "REAL", nullable: false),
                Text = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                FontSize = table.Column<int>(type: "INTEGER", nullable: true),
                ZIndex = table.Column<int>(type: "INTEGER", nullable: false),
                MediaId = table.Column<Guid>(type: "TEXT", nullable: true),
                ImageUrl = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                AltText = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Shapes", x => x.Id);
                table.ForeignKey(
                    name: "FK_Shapes_Boards_BoardId",
                    column: x => x.BoardId,
                    principalTable: "Boards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(name: "IX_Shapes_BoardId", table: "Shapes", column: "BoardId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "Shapes");
        migrationBuilder.DropTable(name: "Boards");
    }
}
