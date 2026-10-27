# Troubleshooting

**"TermC is damaged / can't be opened" on first launch**
The app isn't notarized. Right-click → Open, or run `xattr -dr com.apple.quarantine /Applications/TermC.app`.

**The folder, Git panel or file browser doesn't follow `cd`**
These rely on the shell hooks. Make sure Settings → General → Shell is zsh, bash or fish. If your `.zshrc` replaces `precmd_functions` wholesale (rather than appending with `add-zsh-hook`), the hook is lost. Use `add-zsh-hook precmd …` instead.

**AI command says "No AI provider found"**
Install and log in to Claude Code (`claude`), start Ollama (`ollama serve` + `ollama pull llama3.2`), or add an API key in Settings → AI. Use **Test AI command** there. TermC uses your login shell's `PATH`, so `which claude` in a TermC terminal should find it.

**Screenshots capture only the wallpaper**
Grant Screen Recording to TermC in System Settings → Privacy & Security → Screen Recording, then quit and reopen TermC.

**The screenshot shortcut does nothing**
Another app may own `⌃⇧⌘S` (TermC logs this in `~/.termc/termc.log`). Pick a different shortcut in Settings → Screenshots.

**MCP tools say "TermC is not running"**
The app must be open. Check `claude mcp get termc`. If you moved the app, re-run the `claude mcp add` command from Settings → MCP.

**A dev server isn't detected**
TermC needs a `localhost`/`127.0.0.1` URL in the output and a port that accepts connections. You can always type the URL (or just the port) in the preview's address bar.

**`npm install` fails building node-pty**
Install the Xcode command line tools (`xcode-select --install`) and use Node 20+. If the path to the repo contains spaces and the build fails, clone it somewhere without spaces.

**The window froze or went blank**
TermC detects this and offers to reload the interface (or does it automatically after a crash). Your shells keep running and reconnect. You can also use View → Reload Interface. Details are written to `~/.termc/termc.log`.

**I don't want the "Quit TermC?" question**
Tick "Don't ask again" in the dialog, or turn off Settings → General → Confirm before quitting.

**Reset everything**
Quit TermC and delete `~/.termc` (or move it aside). You lose layouts, aliases, plugin data and screenshots.
