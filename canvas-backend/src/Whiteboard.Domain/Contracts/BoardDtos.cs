namespace Whiteboard.Domain.Contracts;

public sealed record BoardSummaryDto(Guid Id, string Name, DateTimeOffset UpdatedAt);

public sealed record BoardCreatedDto(Guid Id, string Name);

public sealed record BoardDetailDto(Guid Id, string Name, IReadOnlyList<ShapeDto> Shapes);

public sealed record UserDto(Guid UserId, string DisplayName, string Color);

public sealed record CreateBoardRequest(string Name);

public sealed record UpdateBoardRequest(string Name);
