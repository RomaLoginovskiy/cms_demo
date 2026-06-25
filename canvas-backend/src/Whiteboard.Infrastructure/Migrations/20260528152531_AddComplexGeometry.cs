using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddComplexGeometry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GeometryJson",
                table: "Shapes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "RotationX",
                table: "Shapes",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "RotationY",
                table: "Shapes",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TemplateId",
                table: "Shapes",
                type: "TEXT",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "GeometryJson", table: "Shapes");
            migrationBuilder.DropColumn(name: "RotationX", table: "Shapes");
            migrationBuilder.DropColumn(name: "RotationY", table: "Shapes");
            migrationBuilder.DropColumn(name: "TemplateId", table: "Shapes");
        }
    }
}
