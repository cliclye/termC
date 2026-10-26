# Plugins

![Plugin store](images/store.png)

Plugins add commands, status bar items, sidebar panels, context-menu entries, keybindings and themes. Each runs in its own **Web Worker**, isolated from the app and from other plugins. Privileged APIs (running commands, touching files, network) are only available when the manifest asks for them, and the store shows those permissions before you install.

## Built-in store

Open with `⇧⌘X` (or Settings → Plugin Store). All plugins are free and bundled with the app.

| Plugin | What it does | Permissions |
|---|---|---|
| Git Integration | Branch + dirty marker in the status bar; copy branch name; open remote in browser | exec |
| Theme Pack | Tokyo Night, Catppuccin Mocha, Gruvbox Dark, One Dark, GitHub Light | — |
| Pomodoro | 25/5 focus timer in the status bar with notifications | — |
| Quick Notes | Sidebar scratchpad that autosaves; "Add selection to Quick Notes" in the terminal menu | — |
| Port Killer | Pick a listening port and stop its process | exec |
| System Monitor | CPU load and memory pressure in the status bar | exec |
| Snippets | Insert UUIDs/timestamps/saved snippets (`⌥⌘U`, `⌥⌘I`, right-click menu) | — |
| Weather | Current weather in the status bar via wttr.in | http |

Manage installed plugins in Settings → Plugins: enable/disable, reload, uninstall.

## Writing a plugin

A plugin is a folder in `~/.termc/plugins/<id>/`:

```
~/.termc/plugins/hello/
├── manifest.json
└── main.js
```

**manifest.json**

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "author": "you",
  "icon": "sparkles",
  "description": "Says hello.",
  "permissions": ["exec"]
}
```

- `id`: lowercase letters, digits and dashes. It must match the folder name.
- `icon`: one of TermC's icon names (`branch`, `bolt`, `sparkles`, `file`, `globe`, `cpu`, `palette`, `history`, `copy`, `puzzle`, …).
- `permissions`: any of `exec`, `filesystem`, `http`. Leave it empty if you don't need them.
- `main`: entry file, default `main.js`.

**main.js** runs inside the worker with a global `termc`. Top-level `await` works.

```js
termc.commands.register('greet', 'Hello: Greet', async () => {
  const name = await termc.ui.prompt('Your name?');
  if (name) termc.notifications.show(`Hello, ${name}!`, { kind: 'success' });
});

termc.events.on('commandFinished', ({ exitCode, durationMs }) => {
  if (exitCode !== 0) termc.statusBar.set('last', { text: `✗ exit ${exitCode}`, color: '#f7768e' });
  else termc.statusBar.set('last', { text: `✓ ${Math.round(durationMs / 1000)}s` });
});
```

Restart TermC, or click reload in Settings → Plugins, and run **Hello: Greet** from the palette.

The bundled plugins in [`resources/plugins-catalog/`](../resources/plugins-catalog) are complete, short examples.

## API reference

Every method returns a Promise.

### `termc.commands`
| Method | Description |
|---|---|
| `register(id, title, handler)` | Adds a command to the palette as `<plugin>.<id>`. `handler(args)` runs when it's invoked. |
| `execute(commandId)` | Runs any command by id (built-in like `pane.splitRight`, or another plugin's). |

### `termc.terminal`
| Method | Description |
|---|---|
| `active()` | `{ id, cwd, process, running, lastExit, ai }` for the focused pane |
| `list()` | All panes with workspace, tab and info |
| `write(text, paneId?)` | Write raw input (no Enter) |
| `paste(text, paneId?)` | Paste (bracketed paste, so it's safe for multi-line text and AI CLIs) |
| `run(command, paneId?)` | Type the command and press Enter |
| `read(lines?, paneId?)` | Last N lines of plain-text output |
| `create({ cwd?, command?, title? })` | New tab; returns the pane id |
| `split({ paneId?, direction?: 'horizontal'\|'vertical', cwd?, command? })` | New split; returns the pane id |

### `termc.statusBar`
| Method | Description |
|---|---|
| `set(id, { text, tooltip?, color?, icon?, command? })` | Create or update an item. `command` is one of your command ids, run on click. |
| `remove(id)` | Remove it |

### `termc.panels`
| Method | Description |
|---|---|
| `register(id, { title, icon?, html })` | Adds a sidebar panel with a rail button. `html` is rendered in a sandboxed iframe styled with the current theme's CSS variables (`--bg`, `--panel`, `--text`, `--muted`, `--accent`, `--border`, …). |
| `update(id, html)` | Replace the panel HTML |
| `postMessage(id, data)` | Send data to the panel |
| `onMessage(id, fn)` | Receive data from the panel |

Inside the panel HTML, use `termc.postMessage(data)` and `termc.onMessage(fn)`.

### `termc.contextMenu`
| Method | Description |
|---|---|
| `register(id, label, handler)` | Adds an item to the terminal right-click menu. `handler({ paneId, selection, cwd })` |

### `termc.keybindings`
| Method | Description |
|---|---|
| `register(combo, commandId)` | e.g. `register('mod+alt+u', 'uuid')`. `mod` is ⌘ on macOS. Modifiers: `mod`, `ctrl`, `alt`, `shift`. |

### `termc.themes`
| Method | Description |
|---|---|
| `register(theme)` | `{ id, name, dark, ui: {bg, panel, elevated, hover, border, text, muted, accent, accentText, success, warning, danger}, term: {background, foreground, cursor, cursorAccent, selectionBackground, black … brightWhite} }`. Appears in Settings → Appearance and the palette. |

### `termc.notifications`
| Method | Description |
|---|---|
| `show(message, { title?, kind?: 'info'\|'success'\|'error', system? })` | In-app toast, or a macOS notification with `system: true` |

### `termc.ui`
| Method | Description |
|---|---|
| `prompt(title, { placeholder?, value? })` | Text input dialog → string, or `null` if cancelled |
| `pick(items, { title? })` | Fuzzy picker. Items are strings or `{ label, detail?, value }` → chosen value or `null` |

### `termc.storage`
Per-plugin JSON storage in `~/.termc/plugin-data/<id>.json`: `get(key)`, `set(key, value)`, `keys()`.

### `termc.exec` (permission `exec`)
`exec(command, { cwd?, timeout? })` → `{ code, stdout, stderr }`. Runs through `/bin/sh -c`.

### `termc.fs` (permission `filesystem`)
`readFile(path)`, `writeFile(path, content)`, `readDir(path)` → `[{ name, isDir }]`, `exists(path)`.

### `termc.http` (permission `http`)
`fetch(url, { method?, headers?, body? })` → `{ status, ok, headers, body }`. Requests go through the main process, so CORS doesn't apply.

### `termc.app`
`state()` → `{ workspace, cwd, theme, devServers }`.

### `termc.events`
`on(name, handler)`:

| Event | Payload |
|---|---|
| `cwdChanged` | `{ paneId, cwd }` |
| `commandFinished` | `{ paneId, exitCode, durationMs }` |
| `devServers` | array of `{ url, port, framework, paneId }` |
