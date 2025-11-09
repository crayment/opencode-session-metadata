# opencode-session-metadata

Store and retrieve arbitrary JSON metadata for OpenCode sessions.

## Installation

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-session-metadata"]
}
```

OpenCode will automatically install the plugin on startup.

## Tools

### `getSessionData`
Get current session information (id, title, directory, version, etc.)

```
Use getSessionData
```

### `setSessionData`
Update session data. Currently supports setting title only.

```
Use setSessionData with title "New Session Title"
```

### `getMetadata`
Get stored session metadata from external storage.

```
Use getMetadata
```

### `setMetadata`
Store arbitrary JSON metadata for the current session.

```
Use setMetadata with metadata {"projectId": "proj-123", "status": "in-progress"}
```

## How It Works

Metadata is stored as JSON files in `~/.local/share/opencode/storage/session-metadata/<project-id>/<session-id>.json`. The plugin automatically:
- Creates the storage directory
- Adds `sessionId` and `storedAt` timestamps
- Preserves any custom fields you provide

## Use Cases

**Agent Hierarchies:**
```json
{
  "treeId": "pr6187-11021530",
  "parentId": "ses_parent456",
  "level": 1
}
```

**Project Tracking:**
```json
{
  "projectId": "proj-123",
  "epic": "feature-x",
  "sprint": "sprint-24"
}
```

**User Context:**
```json
{
  "userId": "user-789",
  "teamId": "team-alpha",
  "role": "developer"
}
```

**Custom Tags:**
```json
{
  "tags": ["bug-fix", "urgent"],
  "category": "backend",
  "priority": "high"
}
```

## Requirements

- OpenCode >= 0.15.18

## Storage Location

Metadata files are stored in `~/.local/share/opencode/storage/session-metadata/<project-id>/`, organized by project alongside OpenCode's session storage.

## License

MIT

