# Features

![TermC](images/hero.png)

## Terminal and layout

### Split panes
- `⌘D` splits the focused pane to the right; `⇧⌘D` splits it downward. Splits nest as deep as you want.
- Drag a divider to resize; double-click it to reset to 50/50. **Equalize Pane Sizes** (`⌥⌘=`) resets every split in the tab.
- **Rearrange**: hover a pane, grab the `⋯` grip in its toolbar, and drop it on any edge of another pane (even in another tab). A highlight shows where it lands.
- **Zoom** a pane to fill the tab with `⇧⌘↩`; press again to restore.
- Move focus between panes with `⌥⌘←/→/↑/↓`. Inactive panes are dimmed slightly so you can always see which one has focus.
- Each pane is its own shell with its own working directory.

### Tabs
- `⌘T` new tab (opens in the focused pane's folder), `⌘W` close pane, `⇧⌘W` close tab, `⌘1–9` jump to a tab, `⇧⌘[` / `⇧⌘]` cycle.
- Tab titles follow what's happening: the folder name, the running program (`node · acme-web`), or the AI tool (`Claude Code`). Double-click a tab to give it a fixed name.
- Drag tabs to reorder; middle-click to close. A pulsing dot means a command is running, and a sparkle means an AI agent is running.

### Workspaces
- The colored avatars on the left are workspaces, one per project. Each has its own tabs and layout.
- `⇧⌘N` (or **+**) creates one: pick a folder, a name and a color. `⌘O` opens a folder straight into a new workspace.
- Switch with a click or `⌥⌘1–9`; reorder by dragging; right-click to rename, recolor, open a new tab there, or close.

### Session persistence
On quit (and every 30 seconds) TermC saves every workspace, tab, split layout, each pane's working directory and the last 1,000 lines of scrollback. Next launch, everything is restored and each shell restarts in the right folder. Turn this off in Settings → General → Restore sessions.

### Command palette
`⌘K` (or `⇧⌘P`) fuzzy-searches every command, tab, workspace, theme and plugin command, with shortcuts shown. If nothing matches, or you press `Tab`, your text is sent to [AI command generation](ai.md).

### Terminal niceties
- Find in scrollback: `⌘F` (`↩` next, `⇧↩` previous).
- Clickable URLs: localhost links open in the embedded preview, `⌘`-click opens the system browser.
- Right-click menu: copy, paste, select all, split, zoom, clear, find, plus plugin items.
- Font size `⌘=` / `⌘-` / `⌘0`; font, line height, cursor style, scrollback, Option-as-Meta and copy-on-select in Settings → General.
- When a command that took more than 15 s finishes while TermC is in the background, you get a macOS notification with its exit code.
- Exited shells show "press Enter to restart".

## Developer workflow

### Git panel (`⌘G`)
![Git panel](images/graph.png)

- **Branch switcher**: search local and remote branches, check one out (remote branches get a tracking branch), or type a new name and press Enter to create it.
- **Fetch / Pull / Push** buttons with ahead/behind counts. Push sets the upstream automatically the first time.
- **Changes**: staged and unstaged groups, Stage/Unstage per file or all, Discard (with confirmation). Click a file for an **inline diff** with line numbers.
- **Commit** with `⌘↩`. With nothing staged, it commits all changes. Supports amend.
- **Graph**: lane-based commit graph across all branches with branch, tag and HEAD labels. Click a commit for its message, stats and full diff.
- **Worktrees**: create a worktree for a branch (new or existing) in a sibling folder, open it in a tab or split, remove it. This makes it easy to run several AI agents on different branches in parallel.
- Not a repo yet? The panel offers **Initialize repository**.
- The status bar shows the branch and change count of the focused pane; click it to toggle the panel.

### File browser (`⌘B`)
- Tree rooted at the project (Git root) of the focused pane, following you as you `cd`.
- Modified, new and deleted files are colored, and folders containing changes are marked.
- **Drag** any file or folder into a terminal to insert its quoted path. Files dragged from Finder work too.
- Double-click a file to insert its path; right-click for Copy Path, `cd` Here, Open in New Tab / Split, Open with Default App, Reveal in Finder.
- Toggle dotfiles with the eye button.

### @-mention file picker (`⌘P`)
![File picker](images/files.png)

Fuzzy-find any file in the project (respects `.gitignore`). `↩` inserts a path relative to the pane's folder, and `⌘↩` inserts the absolute path. If Claude Code, Codex or Gemini is running in the pane, it inserts `@path` so the agent attaches the file.

### Dev server detection and preview
![Preview](images/preview.png)

- TermC reads terminal output for `localhost` / `127.0.0.1` / `0.0.0.0` URLs, labels the framework (Vite, Next.js, Nuxt, Angular, SvelteKit, Astro, Remix, Webpack, Storybook, Django, Flask, Rails, Expo), and confirms the port is actually listening.
- A toast offers **Preview**; the server also appears in the status bar and the preview's chip row.
- The embedded browser (`⇧⌘B`) has back/forward/reload, a URL bar (type `3000` for `localhost:3000`), open-in-browser and DevTools. Drag its left edge to resize.
- Servers drop off automatically when the port closes.

### Run commands (`⇧⌘R`)
Detected from the focused pane's folder and its Git root:

| Source | Commands |
|---|---|
| `package.json` | every script, run with npm/pnpm/yarn/bun based on the lockfile, plus `install` |
| `deno.json` | tasks |
| `Makefile` | targets |
| `justfile` | recipes |
| `Cargo.toml` | run, build, test, check, clippy |
| `go.mod` | run, build, test, vet |
| `pyproject.toml` / `requirements.txt` | install/sync, pytest, Django runserver, `main.py` (uv/poetry aware) |
| `docker-compose.yml` / `compose.yml` | up, up -d, down, logs |

Click runs the command in a new split, `⌥`-click runs it in the current pane, and `⌘`-click runs it in a new tab.

### Aliases
Settings → Aliases. Define `gs → git status` once and it works in zsh, bash and fish. Saving rewrites small per-shell files that every open shell re-reads at its next prompt, so changes apply everywhere without restarting.

## AI
See [AI features](ai.md): AI commands, providers, session resume and screenshots. For agents controlling TermC, see [MCP](mcp.md).

## Extensibility
- [Plugins](plugins.md) run in Web Workers with a permission-gated API.
- Eight free plugins in the built-in store (`⇧⌘X`): Git Integration, Theme Pack, Pomodoro, Quick Notes, Port Killer, System Monitor, Snippets, Weather.
- Themes: TermC Dark, Dracula, Nord, Solarized Dark, Solarized Light, and more via plugins. Themes restyle the entire UI, not just the terminal.

## Motion
Sidebar and preview slide open, overlays fade and scale in and out, new tabs and panes grow into place, the Git tab indicator slides, disclosure arrows rotate, toasts slide in and out, and theme switches cross-fade. Everything is short (120–320 ms) and switches off when macOS **Reduce motion** is on.
