# MCP server

TermC includes a [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents control the terminal. Claude Code, Cursor, Windsurf and any other MCP client can run commands and read their output, arrange panes, tabs and workspaces, use Git, search files, and open dev-server previews.

## How it works

```
Claude Code ──stdio──▶ termc-mcp.js ──HTTP 127.0.0.1 + token──▶ TermC app
```

- `mcp/termc-mcp.js` is a small stdio MCP server with no dependencies.
- On launch, the app opens a control endpoint on a random **127.0.0.1** port and writes the port plus a random token to `~/.termc/control.json` (file mode 600). The token changes on every launch.
- Each tool call is forwarded to the running app. If TermC isn't open, tools return "TermC is not running".
- The script runs on TermC's own executable with `ELECTRON_RUN_AS_NODE=1`, so you don't need Node installed.

Settings → MCP shows ready-to-copy commands with the correct paths for your install.

## Setup

### Claude Code

```bash
claude mcp add --scope user termc -e ELECTRON_RUN_AS_NODE=1 -- \
  /Applications/TermC.app/Contents/MacOS/TermC \
  /Applications/TermC.app/Contents/Resources/app.asar.unpacked/mcp/termc-mcp.js
```

Check it with `claude mcp get termc`; it should show **✔ Connected** while TermC is open. Remove it with `claude mcp remove termc -s user`.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "termc": {
      "command": "/Applications/TermC.app/Contents/MacOS/TermC",
      "args": ["/Applications/TermC.app/Contents/Resources/app.asar.unpacked/mcp/termc-mcp.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

### Windsurf

Same JSON in `~/.codeium/windsurf/mcp_config.json`.

### Running from source

Point at the checkout instead, using Node:

```bash
claude mcp add --scope user termc -- node /path/to/termC/mcp/termc-mcp.js
```

## Examples

- *"Split the terminal, start the dev server on the right, and open the preview when it's ready."*
  → `pane_split` with `command: "npm run dev"`, `terminal_wait_for` `ready`, `devserver_list`, `preview_open`
- *"Run the tests in a new pane and summarize the failures."* → `pane_split`, `terminal_run`
- *"Make a worktree for feature/payments and open it in a new tab."* → `git_worktree_add`
- *"Which process is my API server running in, and what did it last print?"* → `terminal_list`, `terminal_read`
- *"Put on some lofi while you work on this."* → `spotify_play` with `query: "Lofi Beats"`

`terminal_run` waits for the command to finish (using the shell's own start/end markers) and returns exactly what it printed plus the exit code. For long-running processes such as servers and watchers, pass `wait: false` and then use `terminal_wait_for` / `terminal_read`.

Most tools target the **focused pane** when `paneId` is omitted. Get IDs from `terminal_list`.

## Tool reference (78 tools)

`?` marks an optional argument.

### Terminals

| Tool | What it does | Arguments |
|---|---|---|
| `terminal_list` | List every terminal pane across workspaces and tabs with id, cwd, running process and AI tool. | — |
| `terminal_create` | Open a new terminal tab, optionally in a directory and running a command. | `cwd`?, `command`?, `title`?, `workspaceId`? |
| `terminal_run` | Run a shell command in a terminal and (by default) wait for it to finish, returning its output and exit code. | `paneId`?, `command`, `wait`?, `timeout`? |
| `terminal_write` | Write raw text to a terminal without pressing Enter. | `paneId`?, `text` |
| `terminal_send_keys` | Send special keys: enter, ctrl+c, ctrl+d, ctrl+z, ctrl+l, esc, tab, up, down, left, right, backspace. | `paneId`?, `keys` |
| `terminal_read` | Read the last N lines of plain-text output from a terminal. | `paneId`?, `lines`? |
| `terminal_search_output` | Search a terminal's recent output with a regular expression. | `paneId`?, `pattern` |
| `terminal_wait_for` | Wait until new output in a terminal matches a regex (e.g. a server "ready" line). | `paneId`?, `pattern`, `timeout`? |
| `terminal_interrupt` | Send Ctrl+C to the terminal. | `paneId`? |
| `terminal_clear` | Clear a terminal screen and scrollback. | `paneId`? |
| `terminal_close` | Close a terminal pane. | `paneId`? |
| `terminal_focus` | Focus a terminal pane (switches workspace/tab as needed). | `paneId` |
| `terminal_get_info` | Get cwd, foreground process, running state and last exit code for a terminal. | `paneId`? |
| `terminal_rename` | Set the title of the tab containing a pane. | `paneId`?, `title` |

### Panes

| Tool | What it does | Arguments |
|---|---|---|
| `pane_split` | Split a pane horizontally (side by side) or vertically (stacked) and open a new terminal. | `paneId`?, `direction`?, `cwd`?, `command`? |
| `pane_list` | List panes in the current tab with their layout. | — |
| `pane_focus_direction` | Move focus to the neighbouring pane. | `direction` |
| `pane_zoom` | Toggle maximizing a pane within its tab. | `paneId`? |
| `pane_resize` | Set the split ratio of the split containing a pane (0.1–0.9, share of the first side). | `paneId`?, `ratio` |
| `pane_equalize` | Reset all splits in the current tab to equal sizes. | — |

### Tabs

| Tool | What it does | Arguments |
|---|---|---|
| `tab_list` | List tabs in a workspace. | `workspaceId`? |
| `tab_create` | Create a tab. | `cwd`?, `command`?, `title`? |
| `tab_close` | Close a tab and all its panes. | `tabId`? |
| `tab_focus` | Switch to a tab by id or 1-based index. | `tabId`?, `index`? |
| `tab_rename` | Rename a tab. | `tabId`?, `title` |

### Workspaces

| Tool | What it does | Arguments |
|---|---|---|
| `workspace_list` | List workspaces with color, tabs and active state. | — |
| `workspace_create` | Create a workspace for a project directory. | `name`, `cwd`?, `color`? |
| `workspace_switch` | Switch to a workspace by id or name. | `workspaceId`?, `name`? |
| `workspace_rename` | Rename a workspace. | `workspaceId`?, `name` |
| `workspace_set_color` | Change a workspace color. | `workspaceId`?, `color` |
| `workspace_delete` | Delete a workspace and close its terminals. | `workspaceId` |

### Git

| Tool | What it does | Arguments |
|---|---|---|
| `git_status` | Git branch, upstream, ahead/behind and changed files. | `cwd`? |
| `git_diff` | Unified diff for the working tree, staged changes, or one file. | `cwd`?, `file`?, `staged`? |
| `git_log` | Recent commits across all branches. | `cwd`?, `limit`? |
| `git_show` | Show a commit with stats and patch. | `cwd`?, `hash` |
| `git_branches` | List local and remote branches. | `cwd`? |
| `git_checkout` | Switch branch (optionally creating it). | `cwd`?, `branch`, `create`? |
| `git_stage` | Stage files (all when none given). | `cwd`?, `files`? |
| `git_unstage` | Unstage files (all when none given). | `cwd`?, `files`? |
| `git_commit` | Commit staged changes. | `cwd`?, `message`, `all`?, `amend`? |
| `git_push` | Push the current branch (sets upstream if missing). | `cwd`? |
| `git_pull` | Fast-forward pull the current branch. | `cwd`? |
| `git_fetch` | Fetch all remotes. | `cwd`? |
| `git_worktree_list` | List git worktrees. | `cwd`? |
| `git_worktree_add` | Create a worktree for a branch (new branch if missing) and optionally open it in a tab. | `cwd`?, `branch`, `path`?, `open`? |
| `git_worktree_remove` | Remove a worktree. | `cwd`?, `path`, `force`? |

### Files

| Tool | What it does | Arguments |
|---|---|---|
| `file_list` | List a directory. | `path`?, `hidden`? |
| `file_read` | Read a text file (up to 512KB). | `path` |
| `file_search` | Fuzzy-search project file paths. | `cwd`?, `query`, `limit`? |
| `file_insert_path` | Insert a file path into a terminal (like dragging it in). | `paneId`?, `path` |
| `file_reveal` | Reveal a file or folder in the TermC file browser sidebar. | `path` |

### Dev servers & run commands

| Tool | What it does | Arguments |
|---|---|---|
| `devserver_list` | List detected local dev servers (Vite, Next.js, Angular, Nuxt, …). | — |
| `preview_open` | Open a URL in the embedded preview browser. | `url` |
| `preview_close` | Close the embedded preview. | — |
| `preview_reload` | Reload the embedded preview. | — |
| `run_commands_list` | List detected project commands (npm scripts, Makefile targets, …). | `cwd`? |
| `run_command` | Run a detected project command by name in a new split pane. | `cwd`?, `name`, `source`? |

### AI sessions

| Tool | What it does | Arguments |
|---|---|---|
| `ai_sessions_list` | List recent Claude Code / Codex / Gemini sessions for a directory. | `cwd`? |
| `ai_session_resume` | Resume an AI CLI session in a new tab. | `cwd`?, `command` |

### Spotify

| Tool | What it does | Arguments |
|---|---|---|
| `spotify_now_playing` | What Spotify is playing: track, artist, album, position, volume, shuffle/repeat, and whether Spotify is open. | — |
| `spotify_control` | Control Spotify playback. | `action` (`toggle`, `play`, `pause`, `next`, `previous`, `shuffle_on`, `shuffle_off`, `repeat_on`, `repeat_off`) |
| `spotify_play` | Play a Spotify link/URI (playlist, album, track, artist) or one of the user's saved items by name. Opens Spotify in the background if needed. | `query` |
| `spotify_set_volume` | Set Spotify volume (0–100). | `volume` |
| `spotify_seek` | Jump to a position in the current track. | `seconds` |
| `spotify_saved_list` | List the user's saved Spotify playlists, albums and songs. | — |

### App

| Tool | What it does | Arguments |
|---|---|---|
| `alias_list` | List custom shell aliases. | — |
| `alias_set` | Create or update an alias (hot-reloads in all terminals). | `name`, `command` |
| `alias_remove` | Remove an alias. | `name` |
| `theme_list` | List available themes. | — |
| `theme_set` | Switch theme. | `theme` |
| `notify` | Show a system notification. | `title`, `body`? |
| `screenshot_capture` | Start an interactive region screenshot; the image path is pasted into the focused pane. | — |
| `screenshot_list` | List saved screenshots (per project). | `project`? |
| `plugin_list` | List installed plugins. | — |
| `plugin_set_enabled` | Enable or disable a plugin. | `id`, `enabled` |
| `command_list` | List command palette actions. | — |
| `command_execute` | Run a command palette action by id. | `id` |
| `app_state` | Snapshot of TermC: active workspace, tab, pane, sidebar and dev servers. | — |
