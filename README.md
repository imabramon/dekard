# dekard

MCP server with notes for AI agents: shared memory across chats and sessions.

Example: several skills run `tsc` before doing their job. If a commit has already been checked in another chat, the agent reads the `tsc/<hash>` note and skips the check.

## Features

- Notes as `topic` / `key` / `value`
- Hierarchical topics with `/`: querying `company/branch` returns notes from `company/branch`, `company/branch/a`, `company/branch/a/b`, but not from `company/branchX`
- Soft delete: a deleted note is hidden but can be restored within 30 days, after which it is removed permanently
- SQLite storage (built-in `node:sqlite`), safe concurrent access from multiple chats (WAL)
- All queries are parameterized — protected against SQL injection and covered by tests

## Tools

| Tool | Parameters | Result |
|---|---|---|
| `add_note` | `topic`, `key`, `value` | Creates or overwrites a note |
| `get_note` | `topic`, `key` | Note or `null` |
| `get_topic_notes` | `topic` | Notes of the topic and all nested topics |
| `delete_note` | `topic`, `key` | `true` if the note was deleted |
| `restore_note` | `topic`, `key` | Restored note or `null` |
| `get_deleted_topic_notes` | `topic` | Deleted notes that can still be restored |

Trailing slashes in topics are ignored (`tsc/` → `tsc`). The `\0` character is not allowed in strings.

## Requirements

Node.js **22.18+** — TypeScript runs directly, no build step.

## Installation

```bash
git clone https://github.com/imabramon/dekard.git
cd dekard
npm install
```

### Claude Code

```bash
claude mcp add dekard --scope user -- node /path/to/dekard/src/index.ts
```

### Other MCP clients

```json
{
  "mcpServers": {
    "dekard": {
      "command": "node",
      "args": ["/path/to/dekard/src/index.ts"]
    }
  }
}
```

## Data location

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\dekard\notes.db` |
| macOS | `~/Library/Application Support/dekard/notes.db` |
| Linux | `$XDG_DATA_HOME/dekard/notes.db` (defaults to `~/.local/share/dekard/notes.db`) |

The path can be overridden with the `DEKARD_DB` environment variable:

```bash
claude mcp add dekard --scope user -e DEKARD_DB=/path/to/notes.db -- node /path/to/dekard/src/index.ts
```

## Skill example

```markdown
- get the commit hash: `git rev-parse HEAD`; if there are uncommitted changes, do not use notes
- call get_note(topic="tsc", key=<hash>); if value="passed", skip tsc
- otherwise run tsc; if there are no errors, call add_note(topic="tsc", key=<hash>, value="passed")
```
