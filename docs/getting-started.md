# Getting started

## Install the app

1. Download `TermC-<version>-arm64.dmg` from [Releases](https://github.com/cliclye/termC/releases), or build it yourself (below).
2. Open the DMG and drag **TermC** to **Applications**.
3. First launch: TermC is signed ad-hoc rather than notarized with a paid Apple Developer ID, so macOS may refuse to open a downloaded copy. Right-click the app → **Open** → **Open**, or clear the quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine /Applications/TermC.app
   ```

The release build targets Apple Silicon Macs. To build for Intel, change `"arch": ["arm64"]` to `["x64"]` (or `["universal"]`) in `package.json` → `build.mac.target` and run `npm run dist`.

## First run

TermC opens a **home** workspace in your home folder. A few things to try:

| Try | How |
|---|---|
| Split the terminal | `⌘D` (right) / `⇧⌘D` (down) |
| Open a project as a workspace | `⌘O`, or the **+** under the workspace avatars |
| Ask for a command | `⌘K`, type what you want, press `Tab` |
| Git panel | `⌘G` |
| File browser | `⌘B` |
| Preview a dev server | run `npm run dev`, then click the toast or press `⇧⌘B` |
| Settings | `⌘,` |

## macOS permissions

| Permission | When it is requested | Why |
|---|---|---|
| Screen Recording | First screenshot with `⇧⌘S` | `screencapture` needs it to capture other apps. Grant it in System Settings → Privacy & Security → Screen Recording, then restart TermC. |
| Notifications | First long-running command that finishes while TermC is in the background | "Command finished" alerts and plugin notifications |
| Files and folders | When a terminal touches Desktop/Documents/Downloads | Standard macOS protection for any terminal app |

## Your shell

TermC starts your login shell (`$SHELL`, usually zsh) and loads your normal startup files (`.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`), so your prompt, PATH and plugins work as usual. It then adds small hooks that report the current directory and command start/finish, which power Git status, the file browser, run detection and MCP. History still goes to your usual `~/.zsh_history`.

bash and fish are supported the same way. Change the shell in Settings → General.

## Build from source

Requirements: macOS, Node 20+, Xcode command line tools (`xcode-select --install`), Python 3 (only to regenerate the icon).

```bash
git clone https://github.com/cliclye/termC.git
cd termC
npm install        # also compiles node-pty for Electron
npm start          # bundle with esbuild and launch
```

| Script | What it does |
|---|---|
| `npm start` | Build once and run the app |
| `npm run dev` | Rebuild `dist/` on every change (`node build.mjs --watch`) and run. Restart the app to load the new build |
| `npm run build` | Bundle `src/` into `dist/` |
| `npm run dist` | Build and package `release/TermC-<version>-arm64.dmg` and `.zip` |
| `npm run icon` | Regenerate `build/icon.png` and `build/icon.icns` |
| `npm run mcp` | Run the MCP bridge on stdio (for testing) |

## Where data lives

Everything is in `~/.termc` (set `TERMC_HOME` to use another folder, handy for testing):

| Path | Contents |
|---|---|
| `settings.json` | Preferences (API keys are encrypted with the macOS keychain) |
| `state.json`, `buffers/` | Workspaces, layouts and terminal scrollback for session restore |
| `aliases.json` (+ generated `aliases.zsh/.bash/.fish`) | Your aliases |
| `plugins/`, `plugin-data/` | Installed plugins and their storage |
| `screenshots/<project>/` | Screenshot history |
| `control.json` | Port and token for the MCP bridge (recreated each launch, mode 600) |
