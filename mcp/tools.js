// MCP tool catalog. Each entry: [name, description, properties, required].
const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });
const pane = { paneId: str('Pane/terminal id (defaults to the focused pane)') };
const cwd = { cwd: str('Directory (defaults to the focused pane cwd)') };

const TOOLS = [
  // Terminals
  ['terminal_list', 'List every terminal pane across workspaces and tabs with id, cwd, running process and AI tool.', {}],
  ['terminal_create', 'Open a new terminal tab, optionally in a directory and running a command.', { cwd: str('Starting directory'), command: str('Command to run after the shell starts'), title: str('Tab title'), workspaceId: str('Workspace id') }],
  ['terminal_run', 'Run a shell command in a terminal and (by default) wait for it to finish, returning its output and exit code.', { ...pane, command: str('Command line to run'), wait: bool('Wait for completion (default true)'), timeout: num('Max wait in ms (default 60000)') }, ['command']],
  ['terminal_write', 'Write raw text to a terminal without pressing Enter.', { ...pane, text: str('Text to write') }, ['text']],
  ['terminal_send_keys', 'Send special keys: enter, ctrl+c, ctrl+d, ctrl+z, ctrl+l, esc, tab, up, down, left, right, backspace.', { ...pane, keys: { type: 'array', items: { type: 'string' }, description: 'Keys in order' } }, ['keys']],
  ['terminal_read', 'Read the last N lines of plain-text output from a terminal.', { ...pane, lines: num('Number of lines (default 100)') }],
  ['terminal_search_output', 'Search a terminal\'s recent output with a regular expression.', { ...pane, pattern: str('JavaScript regular expression') }, ['pattern']],
  ['terminal_wait_for', 'Wait until new output in a terminal matches a regex (e.g. a server "ready" line).', { ...pane, pattern: str('JavaScript regular expression'), timeout: num('Max wait in ms (default 30000)') }, ['pattern']],
  ['terminal_interrupt', 'Send Ctrl+C to the terminal.', { ...pane }],
  ['terminal_clear', 'Clear a terminal screen and scrollback.', { ...pane }],
  ['terminal_close', 'Close a terminal pane.', { ...pane }],
  ['terminal_focus', 'Focus a terminal pane (switches workspace/tab as needed).', { ...pane }, ['paneId']],
  ['terminal_get_info', 'Get cwd, foreground process, running state and last exit code for a terminal.', { ...pane }],
  ['terminal_rename', 'Set the title of the tab containing a pane.', { ...pane, title: str('New title') }, ['title']],
  // Panes
  ['pane_split', 'Split a pane horizontally (side by side) or vertically (stacked) and open a new terminal.', { ...pane, direction: { type: 'string', enum: ['horizontal', 'vertical'], description: 'horizontal = new pane to the right, vertical = below' }, cwd: str('Directory for the new pane'), command: str('Command to run in the new pane') }],
  ['pane_list', 'List panes in the current tab with their layout.', {}],
  ['pane_focus_direction', 'Move focus to the neighbouring pane.', { direction: { type: 'string', enum: ['left', 'right', 'up', 'down'] } }, ['direction']],
  ['pane_zoom', 'Toggle maximizing a pane within its tab.', { ...pane }],
  ['pane_resize', 'Set the split ratio of the split containing a pane (0.1–0.9, share of the first side).', { ...pane, ratio: num('Ratio between 0.1 and 0.9') }, ['ratio']],
  ['pane_equalize', 'Reset all splits in the current tab to equal sizes.', {}],
  // Tabs
  ['tab_list', 'List tabs in a workspace.', { workspaceId: str('Workspace id (defaults to active)') }],
  ['tab_create', 'Create a tab.', { cwd: str('Starting directory'), command: str('Command to run'), title: str('Title') }],
  ['tab_close', 'Close a tab and all its panes.', { tabId: str('Tab id (defaults to active)') }],
  ['tab_focus', 'Switch to a tab by id or 1-based index.', { tabId: str('Tab id'), index: num('1-based index') }],
  ['tab_rename', 'Rename a tab.', { tabId: str('Tab id (defaults to active)'), title: str('New title') }, ['title']],
  // Workspaces
  ['workspace_list', 'List workspaces with color, tabs and active state.', {}],
  ['workspace_create', 'Create a workspace for a project directory.', { name: str('Workspace name'), cwd: str('Project directory'), color: str('Hex color like #7c9cff') }, ['name']],
  ['workspace_switch', 'Switch to a workspace by id or name.', { workspaceId: str('Workspace id'), name: str('Workspace name') }],
  ['workspace_rename', 'Rename a workspace.', { workspaceId: str('Workspace id (defaults to active)'), name: str('New name') }, ['name']],
  ['workspace_set_color', 'Change a workspace color.', { workspaceId: str('Workspace id (defaults to active)'), color: str('Hex color') }, ['color']],
  ['workspace_delete', 'Delete a workspace and close its terminals.', { workspaceId: str('Workspace id') }, ['workspaceId']],
  // Git
  ['git_status', 'Git branch, upstream, ahead/behind and changed files.', { ...cwd }],
  ['git_diff', 'Unified diff for the working tree, staged changes, or one file.', { ...cwd, file: str('File path relative to repo root'), staged: bool('Show staged diff') }],
  ['git_log', 'Recent commits across all branches.', { ...cwd, limit: num('Max commits (default 30)') }],
  ['git_show', 'Show a commit with stats and patch.', { ...cwd, hash: str('Commit hash') }, ['hash']],
  ['git_branches', 'List local and remote branches.', { ...cwd }],
  ['git_checkout', 'Switch branch (optionally creating it).', { ...cwd, branch: str('Branch name'), create: bool('Create the branch') }, ['branch']],
  ['git_stage', 'Stage files (all when none given).', { ...cwd, files: { type: 'array', items: { type: 'string' } } }],
  ['git_unstage', 'Unstage files (all when none given).', { ...cwd, files: { type: 'array', items: { type: 'string' } } }],
  ['git_commit', 'Commit staged changes.', { ...cwd, message: str('Commit message'), all: bool('Stage everything first'), amend: bool('Amend previous commit') }, ['message']],
  ['git_push', 'Push the current branch (sets upstream if missing).', { ...cwd }],
  ['git_pull', 'Fast-forward pull the current branch.', { ...cwd }],
  ['git_fetch', 'Fetch all remotes.', { ...cwd }],
  ['git_worktree_list', 'List git worktrees.', { ...cwd }],
  ['git_worktree_add', 'Create a worktree for a branch (new branch if missing) and optionally open it in a tab.', { ...cwd, branch: str('Branch name'), path: str('Target directory (default: sibling folder)'), open: bool('Open a tab there (default true)') }, ['branch']],
  ['git_worktree_remove', 'Remove a worktree.', { ...cwd, path: str('Worktree path'), force: bool('Force removal') }, ['path']],
  // Files
  ['file_list', 'List a directory.', { path: str('Directory (defaults to focused pane cwd)'), hidden: bool('Include dotfiles') }],
  ['file_read', 'Read a text file (up to 512KB).', { path: str('File path (absolute or relative to cwd)') }, ['path']],
  ['file_search', 'Fuzzy-search project file paths.', { ...cwd, query: str('Search text'), limit: num('Max results (default 30)') }, ['query']],
  ['file_insert_path', 'Insert a file path into a terminal (like dragging it in).', { ...pane, path: str('File path') }, ['path']],
  ['file_reveal', 'Reveal a file or folder in the TermC file browser sidebar.', { path: str('Path') }, ['path']],
  // Dev servers / run commands
  ['devserver_list', 'List detected local dev servers (Vite, Next.js, Angular, Nuxt, …).', {}],
  ['preview_open', 'Open a URL in the embedded preview browser.', { url: str('URL, e.g. http://localhost:5173') }, ['url']],
  ['preview_close', 'Close the embedded preview.', {}],
  ['preview_reload', 'Reload the embedded preview.', {}],
  ['run_commands_list', 'List detected project commands (npm scripts, Makefile targets, …).', { ...cwd }],
  ['run_command', 'Run a detected project command by name in a new split pane.', { ...cwd, name: str('Command name, e.g. "dev" or "build"'), source: str('Optional source filter, e.g. "npm" or "make"') }, ['name']],
  // AI sessions
  ['ai_sessions_list', 'List recent Claude Code / Codex / Gemini sessions for a directory.', { ...cwd }],
  ['ai_session_resume', 'Resume an AI CLI session in a new tab.', { ...cwd, command: str('Resume command from ai_sessions_list') }, ['command']],
  // App
  ['alias_list', 'List custom shell aliases.', {}],
  ['alias_set', 'Create or update an alias (hot-reloads in all terminals).', { name: str('Alias name'), command: str('Expansion') }, ['name', 'command']],
  ['alias_remove', 'Remove an alias.', { name: str('Alias name') }, ['name']],
  ['theme_list', 'List available themes.', {}],
  ['theme_set', 'Switch theme.', { theme: str('Theme id') }, ['theme']],
  ['notify', 'Show a system notification.', { title: str('Title'), body: str('Body') }, ['title']],
  ['screenshot_capture', 'Start an interactive region screenshot; the image path is pasted into the focused pane.', {}],
  ['screenshot_list', 'List saved screenshots (per project).', { project: str('Project filter') }],
  ['plugin_list', 'List installed plugins.', {}],
  ['plugin_set_enabled', 'Enable or disable a plugin.', { id: str('Plugin id'), enabled: bool('Enabled') }, ['id', 'enabled']],
  ['command_list', 'List command palette actions.', {}],
  ['command_execute', 'Run a command palette action by id.', { id: str('Command id from command_list') }, ['id']],
  ['app_state', 'Snapshot of TermC: active workspace, tab, pane, sidebar and dev servers.', {}],
];

module.exports = TOOLS.map(([name, description, properties, required = []]) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required },
}));
