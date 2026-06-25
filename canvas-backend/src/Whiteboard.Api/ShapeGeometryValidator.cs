using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Whiteboard.Domain;
using Whiteboard.Domain.Contracts;

namespace Whiteboard.Api;

internal static class ShapeGeometryValidator
{
    private const int MaxGeometryBytes = 2 * 1024 * 1024;

    public static void ValidateForCreate(ShapeDto dto)
    {
        if (dto.Type is not (ShapeType.Path or ShapeType.Mesh3D))
        {
            return;
        }

        ValidateGeometry(dto.Type, dto.GeometryJson);
    }

    public static void ValidateGeometry(ShapeType type, string? geometryJson)
    {
        if (string.IsNullOrWhiteSpace(geometryJson))
        {
            throw new HubException($"{type} requires geometryJson on create.");
        }

        if (System.Text.Encoding.UTF8.GetByteCount(geometryJson) > MaxGeometryBytes)
        {
            throw new HubException("geometryJson exceeds maximum size.");
        }

        using var document = JsonDocument.Parse(geometryJson);
        var root = document.RootElement;
        if (!root.TryGetProperty("version", out var version) || version.GetInt32() != 1)
        {
            throw new HubException("geometryJson must include version: 1.");
        }

        if (!root.TryGetProperty("kind", out var kind))
        {
            throw new HubException("geometryJson must include kind.");
        }

        var expectedKind = type == ShapeType.Path ? "path" : "mesh3d";
        if (!string.Equals(kind.GetString(), expectedKind, StringComparison.Ordinal))
        {
            throw new HubException($"geometryJson kind must be '{expectedKind}'.");
        }
    }
}
