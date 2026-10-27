# Architecture

TermC is an Electron app: a Node **main process** owns shells, Git and the filesystem, and a React **renderer** owns the UI and layout. There's no framework beyond React and xterm.js, and esbuild bundles everything in well under a second.

```
┌──────────────────────── main process (src/main) ────────────────────────┐
│ pty.js        node-pty shells, shell-integration parsing, output tails  │
│ git.js        git CLI wrapper (status, diff, log, branches, worktrees)   │
│ files.js      directory listing, project file index                     │
│ runner.js     run-command detection                                     │
│ devservers.js dev-server URL detection + port probing                   │
│ ai.js         NL → command (Claude CLI / Ollama / Anthropic / OpenAI)   │
│ aiSessions.js Claude/Codex/Gemini session discovery + resume commands   │
│ plugins.js    plugin install + permission-gated privileged API          │
│ spotify.js    Spotify app control (JXA via osascript) + change events   │
│ screenshots.js, aliases.js, settings.js                                 │
│ control.js    127.0.0.1 HTTP endpoint for the MCP bridge                │
└────────────────────────────── IPC (preload.js) ─────────────────────────┘
┌──────────────────────── renderer (src/renderer) ────────────────────────┐
│ store.js        app state: workspaces → tabs → split tree; persistence  │
│ layout.js       binary split-tree helpers                                │
│ terminals.js    xterm.js instances (live outside React)                 │
│ commands.js     command registry + keybindings                          │
│ control.js      executes MCP tool calls                                  │
│ spotify.js      player state, optimistic controls, saved music          │
│ plugin-host.js  Web Worker plugin runtime                               │
│ components/     React UI                                                 │
└──────────────────────────────────────────────────────────────────────────┘
mcp/termc-mcp.js   stdio MCP server → control endpoint
resources/shell/   zsh / bash / fish integration scripts
resources/plugins-catalog/  bundled store plugins
```

## Key design points

**Shell integration.** For zsh, TermC sets `ZDOTDIR` to `resources/shell/zsh`. Its startup files source the user's real ones (restoring `ZDOTDIR` and `HISTFILE`), then add `precmd`/`preexec` hooks that print:

- `OSC 1337;CurrentDir=<path>`: the working directory, which drives Git, files, run detection and session restore
- `OSC 133;C` / `OSC 133;D;<exit>`: command start/end, which drive busy indicators, notifications and exact output capture for MCP `terminal_run`

bash uses `--rcfile` with `PROMPT_COMMAND`/`PS0`, and fish uses `--init-command` with event handlers.

**Aliases** are stored as JSON and rendered to `aliases.{zsh,bash,fish}`. Each shell compares the file's mtime at every prompt and re-sources it when it changes, which is how edits hot-reload everywhere.

**Layout** is a binary tree per tab: `{type:'pane', id, cwd}` or `{type:'split', dir, ratio, a, b}`. Pane ids double as pty ids, so main and renderer agree on identity.

**Terminals outside React.** Each xterm instance owns a host `<div>` that is re-parented when React remounts a pane (splitting, rearranging, zooming), so the screen and scrollback are never lost.

**Persistence.** The renderer saves a layout snapshot ~800 ms after changes and serializes scrollback (`@xterm/addon-serialize`) every 30 s and on quit. Quitting waits for that save.

**Process detection.** About once a second, main checks each pty's foreground process. For `node` and similar, it reads the foreground process group's command line with `ps` to recognize `claude`, `codex` and `gemini`.

**Dev servers.** Output is scanned for local URLs; the framework is inferred from nearby text, and the port is confirmed with a TCP connect (IPv4 and IPv6). A sweep every 4 s removes dead servers.

**MCP.** `control.js` accepts `POST /rpc` with a bearer token. Main forwards each call to the renderer (`control:request`), which owns layout and focus and replies with `control:response`.

**Plugins.** The source is wrapped with a bootstrap that defines `termc` and loaded into a `Worker` from a Blob URL. Calls are posted to the host. UI calls (status bar, panels, commands) are handled in the renderer; `exec`/`fs`/`http`/`storage` go to main, which checks the manifest's permissions.

**Motion.** `motion.js` has `usePresence` (keep mounted while animating out) and `useLatest` (keep the last overlay's content during exit). Timing uses `setTimeout` rather than `requestAnimationFrame`, so UI opened while the window is hidden (e.g. by MCP) still appears. All animations are CSS and disabled under `prefers-reduced-motion`.

## Packaging

`npm run dist` runs electron-builder (config in `package.json` → `build`):

- `dist/`, `resources/`, `mcp/` and `node-pty` go into `app.asar`; `resources/` and `mcp/` are **unpacked** (`app.asar.unpacked`) because shells source the integration scripts and external MCP clients execute the bridge directly. Code resolves these paths with `unpacked()` in `src/main/util.js`.
- `build/after-pack.js` signs the bundle ad-hoc (`codesign --sign -`) so Apple Silicon will launch it without a Developer ID.
- The icon is generated by `build/make-icon.py` (Pillow + `iconutil`).

## Contributing

- Keep main-process code free of UI concerns, and keep renderer code talking to main only through `window.termc` (preload).
- New user-facing actions should be commands in `commands.js` so they get a palette entry and an optional shortcut. If agents should be able to use them, also add an MCP tool (`mcp/tools.js` + a handler in `renderer/control.js`).
- Test against a throwaway data folder: `TERMC_HOME=/tmp/termc-test npm start`.

**Spotify.** `src/main/spotify.js` runs one small JavaScript-for-Automation script through `osascript` for every action, queued so rapid clicks apply in order. `Application('Spotify')` throws instead of prompting when Spotify isn't installed, and `.running()` checks without launching it. Spotify posts the `com.spotify.client.PlaybackStateChanged` distributed notification on every change, which main subscribes to with `systemPreferences.subscribeNotification`, so the UI updates instantly and only polls slowly (5 s while open, 15 s otherwise) as a fallback. The renderer keeps player state in its own small store (`src/renderer/spotify.js`) so playback updates never trigger session saves, and extrapolates the position locally while playing.
