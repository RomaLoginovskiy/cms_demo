using Whiteboard.Domain.Contracts;

namespace Whiteboard.Api;

public interface IBoardPresenceStore
{
    IReadOnlyList<UserDto> Join(string connectionId, Guid boardId, UserDto user);

    UserDto? FindUser(string connectionId, Guid boardId);

    UserDto? Leave(string connectionId, Guid boardId);

    IReadOnlyList<BoardPresence> RemoveConnection(string connectionId);
}

public sealed record BoardPresence(Guid BoardId, UserDto User);

public sealed class BoardPresenceStore : IBoardPresenceStore
{
    private readonly object _sync = new();
    private readonly Dictionary<string, ConnectionPresence> _connections = [];

    public IReadOnlyList<UserDto> Join(string connectionId, Guid boardId, UserDto user)
    {
        lock (_sync)
        {
            var presence = GetOrCreatePresence(connectionId, user);
            presence.User = user;
            presence.BoardIds.Add(boardId);
            return Snapshot(boardId);
        }
    }

    public UserDto? Leave(string connectionId, Guid boardId)
    {
        lock (_sync)
        {
            return TryLeave(connectionId, boardId);
        }
    }

    public UserDto? FindUser(string connectionId, Guid boardId)
    {
        lock (_sync)
        {
            return TryFindUser(connectionId, boardId);
        }
    }

    public IReadOnlyList<BoardPresence> RemoveConnection(string connectionId)
    {
        lock (_sync)
        {
            return RemoveConnectionCore(connectionId);
        }
    }

    private ConnectionPresence GetOrCreatePresence(string connectionId, UserDto user)
    {
        if (_connections.TryGetValue(connectionId, out var presence))
        {
            return presence;
        }

        presence = new ConnectionPresence(user);
        _connections[connectionId] = presence;
        return presence;
    }

    private UserDto? TryLeave(string connectionId, Guid boardId)
    {
        if (!_connections.TryGetValue(connectionId, out var presence))
        {
            return null;
        }

        return RemoveBoard(connectionId, presence, boardId);
    }

    private UserDto? TryFindUser(string connectionId, Guid boardId)
    {
        if (!_connections.TryGetValue(connectionId, out var presence))
        {
            return null;
        }

        return presence.BoardIds.Contains(boardId) ? presence.User : null;
    }

    private UserDto? RemoveBoard(string connectionId, ConnectionPresence presence, Guid boardId)
    {
        if (!presence.BoardIds.Remove(boardId))
        {
            return null;
        }

        if (presence.BoardIds.Count == 0)
        {
            _connections.Remove(connectionId);
        }

        return presence.User;
    }

    private IReadOnlyList<UserDto> Snapshot(Guid boardId) =>
        _connections.Values
            .Where(presence => presence.BoardIds.Contains(boardId))
            .Select(presence => presence.User)
            .ToList();

    private IReadOnlyList<BoardPresence> RemoveConnectionCore(string connectionId)
    {
        if (!_connections.Remove(connectionId, out var presence))
        {
            return [];
        }

        return presence.BoardIds
            .Select(boardId => new BoardPresence(boardId, presence.User))
            .ToList();
    }

    private sealed class ConnectionPresence(UserDto user)
    {
        public UserDto User { get; set; } = user;

        public HashSet<Guid> BoardIds { get; } = [];
    }
}
