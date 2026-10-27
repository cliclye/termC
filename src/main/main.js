const { app, BrowserWindow, ipcMain, Menu, Notification, dialog, globalShortcut, shell, nativeTheme, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const { TERMC_HOME, readJSON, writeJSON, uid, unpacked } = require('./util');
const settings = require('./settings');
const aliases = require('./aliases');
const git = require('./git');
const files = require('./files');
const runner = require('./runner');
const ai = require('./ai');
const aiSessions = require('./aiSessions');
const plugins = require('./plugins');
const screenshots = require('./screenshots');
const control = require('./control');
const { PtyManager } = require('./pty');
const { DevServers } = require('./devservers');

app.setName('TermC');

// A custom TERMC_HOME (used for testing) gets its own browser profile, so it can run beside the normal app.
if (process.env.TERMC_HOME) app.setPath('userData', path.join(TERMC_HOME, 'chromium'));

// One TermC per data folder: a second copy would fight over the saved layout and the MCP endpoint.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// Log instead of showing Electron's crash dialog; the app keeps running.
const LOG_FILE = path.join(TERMC_HOME, 'termc.log');
function log(...parts) {
  try {
    const line = `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2e6) fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}
process.on('uncaughtException', (e) => log('uncaughtException', e));
process.on('unhandledRejection', (e) => log('unhandledRejection', e));

const STATE_FILE = path.join(TERMC_HOME, 'state.json');
const BUFFERS = path.join(TERMC_HOME, 'buffers');
const MCP_SCRIPT = unpacked(path.join(__dirname, '..', 'mcp', 'termc-mcp.js'));

let win = null;
let quitting = false;
let activePane = { id: null, cwd: null };
let ctl = null;
const pending = new Map();

const ptys = new PtyManager();
const dev = new DevServers();
const send = (ch, ...args) => win && !win.isDestroyed() && win.webContents.send(ch, ...args);

ptys.on('data', (id, data) => {
  send('pty:data', id, data);
  dev.feed(id, data);
});
ptys.on('exit', (id, code) => {
  send('pty:exit', id, code);
  dev.removePane(id);
});
ptys.on('cwd', (id, cwd) => send('pty:cwd', id, cwd));
ptys.on('command', (id, info) => send('pty:command', id, info));
ptys.on('process', (id, info) => send('pty:process', id, info));
dev.on('change', (list) => send('devservers', list));

// Apps launched from Finder get a minimal PATH; borrow the login shell's.
function loadLoginPath() {
  return new Promise((resolve) => {
    const sh = process.env.SHELL || '/bin/zsh';
    execFile(sh, ['-ilc', 'printf "__TERMC__%s__TERMC__" "$PATH"'], { timeout: 4000 }, (err, stdout) => {
      const m = String(stdout || '').match(/__TERMC__(.*)__TERMC__/);
      if (m && m[1]) process.env.PATH = m[1];
      resolve();
    });
  });
}

// Saved bounds can point at a monitor that is no longer attached.
function savedBounds() {
  const b = readJSON(path.join(TERMC_HOME, 'window.json'), null);
  const fallback = { width: 1320, height: 840 };
  if (!b || !(b.width > 0) || !(b.height > 0)) return fallback;
  const visible = screen.getAllDisplays().some(({ workArea: w }) => b.x < w.x + w.width - 80 && b.x + b.width > w.x + 80 && b.y >= w.y - 10 && b.y < w.y + w.height - 80);
  return visible ? b : { width: Math.min(b.width, 1600), height: Math.min(b.height, 1000) };
}

function createWindow() {
  const bounds = savedBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 420,
    title: 'TermC',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0e1014',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false,
      // Terminals and MCP-driven UI must keep updating while the window is in the background.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  const saveBounds = () => !win.isDestroyed() && !win.isFullScreen() && writeJSON(path.join(TERMC_HOME, 'window.json'), win.getBounds());
  win.on('resize', debounce(saveBounds, 500));
  win.on('move', debounce(saveBounds, 500));
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    requestQuit();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // If the UI process dies, bring it back; shells keep running in the main process.
  win.webContents.on('render-process-gone', (_e, details) => {
    log('renderer gone', details);
    if (!quitting && details.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && win.reload(), 500);
  });
  // A frozen UI (not crashed) gets an offer to reload; shells and their output survive.
  let asking = false;
  win.on('unresponsive', async () => {
    if (asking || quitting) return;
    asking = true;
    log('window unresponsive');
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: "TermC's window isn't responding",
      detail: 'Your shells are still running. Reloading the interface reconnects to them.',
      buttons: ['Reload Interface', 'Keep Waiting'],
      defaultId: 0,
      cancelId: 1,
    });
    asking = false;
    if (response === 0 && !win.isDestroyed()) win.webContents.forcefullyCrashRenderer(), setTimeout(() => !win.isDestroyed() && win.reload(), 300);
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// Give the renderer a moment to persist layout + scrollback before exiting.
let confirmingQuit = false;
async function requestQuit() {
  if (quitting || confirmingQuit) return;
  if (!win || win.isDestroyed()) {
    quitting = true;
    return app.quit();
  }
  // Quitting ends every shell; say so when programs (dev servers, AI agents, builds) are still running.
  const busy = ptys.list().filter((p) => p.running || (p.process && !SHELLS.has(p.process)));
  if (busy.length && settings.load().confirmQuit !== false) {
    confirmingQuit = true;
    const names = [...new Set(busy.map((p) => p.ai?.name || p.process))].slice(0, 4).join(', ');
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'question',
      message: `Quit TermC? ${busy.length} running ${busy.length === 1 ? 'program' : 'programs'} will be stopped.`,
      detail: `Still running: ${names}. Your layout and scrollback are saved either way.`,
      buttons: ['Quit', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      checkboxLabel: "Don't ask again",
    });
    confirmingQuit = false;
    if (response !== 0) return;
    if (checkboxChecked) settings.save({ confirmQuit: false });
  }
  send('app:before-quit');
  setTimeout(finishQuit, 2000);
}
const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', '-zsh', '-bash', 'login']);

function finishQuit() {
  if (quitting) return;
  quitting = true;
  ptys.killAll();
  ctl?.stop();
  app.quit();
}

function registerScreenshotShortcut() {
  globalShortcut.unregisterAll();
  const acc = settings.load().screenshotShortcut;
  if (!acc) return;
  try {
    if (!globalShortcut.register(acc, () => takeScreenshot())) log(`screenshot shortcut ${acc} is taken by another app`);
  } catch (e) {
    log('Could not register screenshot shortcut', e);
  }
}

let capturing = false;
async function takeScreenshot() {
  if (capturing) return null; // a selection is already on screen
  capturing = true;
  let shot;
  try {
    const cwd = activePane.cwd || (activePane.id && ptys.info(activePane.id)?.cwd);
    shot = await screenshots.capture(cwd);
  } finally {
    capturing = false;
  }
  if (!shot) return null;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  send('screenshot:captured', shot);
  return shot;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: 'TermC',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('menu', 'settings.open') },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { label: 'Quit TermC', accelerator: 'Cmd+Q', click: () => requestQuit() },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        // Terminals need their own select-all; the renderer decides what has focus.
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('menu', 'edit.selectAll') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', click: () => send('menu', 'palette.open') },
        { type: 'separator' },
        { label: 'Reload Interface', click: () => win && !win.isDestroyed() && win.reload() },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC ----
const handle = (ch, fn) =>
  ipcMain.handle(ch, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      log(`ipc ${ch} failed`, e);
      throw e;
    }
  });

handle('settings:get', () => settings.load());
handle('settings:set', (next) => {
  const prev = settings.load().screenshotShortcut;
  const s = settings.save(next);
  if (s.screenshotShortcut !== prev) registerScreenshotShortcut();
  return s;
});

handle('pty:create', (opts) => ptys.create({ ...opts, shell: opts.shell || settings.load().shell }));
ipcMain.on('pty:write', (_e, id, data) => ptys.write(id, data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));
handle('pty:kill', (id) => {
  ptys.kill(id);
  dev.removePane(id);
  fs.rmSync(path.join(BUFFERS, `${id}.txt`), { force: true });
});
handle('pty:info', (id) => ptys.info(id));
handle('pty:list', () => ptys.list());
handle('pty:read', (id, lines) => ptys.read(id, lines));
handle('pty:runAndWait', (id, cmd, timeout) => ptys.runAndWait(id, cmd, timeout));
handle('pty:waitFor', (id, pattern, timeout) => ptys.waitFor(id, pattern, timeout));
ipcMain.on('pane:active', (_e, info) => (activePane = info || activePane));
ipcMain.on('app:log', (_e, ...parts) => log('renderer', ...parts));

handle('git:status', (cwd) => git.status(cwd));
handle('git:diff', (cwd, file, staged, untracked) => git.diff(cwd, file, staged, untracked));
handle('git:stage', (cwd, f) => git.stage(cwd, f));
handle('git:unstage', (cwd, f) => git.unstage(cwd, f));
handle('git:discard', (cwd, f, u) => git.discard(cwd, f, u));
handle('git:commit', (cwd, msg, opts) => git.commit(cwd, msg, opts));
handle('git:remote', (cwd, op) => git.remoteOp(cwd, op));
handle('git:log', (cwd, n) => git.log(cwd, n));
handle('git:show', (cwd, h) => git.show(cwd, h));
handle('git:branches', (cwd) => git.branches(cwd));
handle('git:checkout', (cwd, b, o) => git.checkout(cwd, b, o));
handle('git:worktrees', (cwd) => git.worktrees(cwd));
handle('git:worktreeAdd', (cwd, o) => git.worktreeAdd(cwd, o));
handle('git:worktreeRemove', (cwd, p, f) => git.worktreeRemove(cwd, p, f));
handle('git:root', (cwd) => git.root(cwd));
handle('git:init', (cwd) => git.init(cwd));

handle('fs:list', (dir, hidden) => files.listDir(dir, hidden));
handle('fs:projectFiles', (cwd) => files.projectFiles(cwd));
handle('fs:read', (file) => files.readFile(file));
handle('fs:reveal', (p) => shell.showItemInFolder(p));
handle('fs:openPath', (p) => shell.openPath(p));
handle('fs:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

handle('runner:detect', (cwd) => runner.detect(cwd));
handle('ai:generate', (req) => ai.generate(req));
handle('ai:providers', () => ai.providers());
handle('aiSessions:forCwd', (cwd) => aiSessions.forCwd(cwd));
handle('aiSessions:resumeCommand', (s) => aiSessions.resumeCommand(s));

handle('aliases:list', () => aliases.list());
handle('aliases:save', (list) => aliases.save(list));

handle('plugins:installed', () => plugins.installed());
handle('plugins:catalog', () => plugins.catalog());
handle('plugins:install', (id) => plugins.install(id));
handle('plugins:uninstall', (id) => plugins.uninstall(id));
handle('plugins:source', (id) => plugins.source(id));
handle('plugins:api', (id, method, args) => plugins.api(id, method, args));

handle('screenshots:list', () => screenshots.list());
handle('screenshots:trash', (file) => {
  if (!path.resolve(file).startsWith(screenshots.DIR + path.sep)) throw new Error('Not a TermC screenshot');
  return shell.trashItem(file);
});
handle('screenshots:capture', () => takeScreenshot());
handle('screenshots:openDir', () => shell.openPath(screenshots.DIR));

handle('devservers:list', () => dev.list());

handle('state:load', () => {
  const state = readJSON(STATE_FILE, null);
  const buffers = {};
  if (state && settings.load().restoreSessions) {
    for (const f of fs.readdirSync(BUFFERS)) {
      if (f.endsWith('.txt')) buffers[f.slice(0, -4)] = fs.readFileSync(path.join(BUFFERS, f), 'utf8');
    }
  }
  return { state, buffers };
});
handle('state:save', ({ state, buffers }) => {
  if (state) writeJSON(STATE_FILE, state);
  if (buffers) {
    const keep = new Set(Object.keys(buffers));
    for (const [id, text] of Object.entries(buffers)) fs.writeFileSync(path.join(BUFFERS, `${id}.txt`), text);
    // Remove scrollback of panes that no longer exist.
    if (state) for (const f of fs.readdirSync(BUFFERS)) if (!keep.has(f.slice(0, -4))) fs.rmSync(path.join(BUFFERS, f), { force: true });
  }
  return true;
});
handle('app:quitReady', () => finishQuit());
handle('app:info', () => ({
  version: app.getVersion(),
  home: TERMC_HOME,
  homeDir: require('node:os').homedir(),
  mcpScript: MCP_SCRIPT,
  node: process.execPath,
  control: ctl?.info(),
  platform: process.platform,
}));
handle('app:notify', ({ title, body }) => {
  new Notification({ title: title || 'TermC', body: body || '' }).show();
});
handle('app:openExternal', (url) => /^https?:\/\//.test(url) && shell.openExternal(url));
handle('app:uid', () => uid());

ipcMain.on('control:response', (_e, id, result, error) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  error ? p.reject(new Error(error)) : p.resolve(result);
});

// MCP calls are executed by the renderer, which owns layout and the active pane.
function dispatchControl(method, params) {
  if (!win || win.isDestroyed()) throw new Error('TermC window is not open');
  return new Promise((resolve, reject) => {
    const id = uid('rq');
    pending.set(id, { resolve, reject });
    send('control:request', id, method, params);
    // Long-running tools (terminal_run, terminal_wait_for) default to waiting 30–60 s themselves.
    const timeout = Math.max(15000, (params.timeout || 60000) + 5000);
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`Timed out running ${method}`));
    }, timeout);
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  nativeTheme.themeSource = 'dark';
  if (!app.isPackaged && process.platform === 'darwin') {
    try {
      app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
    } catch {}
  }
  await loadLoginPath();
  aliases.ensure();
  buildMenu();
  createWindow();
  registerScreenshotShortcut();
  ctl = control.start(dispatchControl);
});

// Links that the preview tries to open in a new window go to the system browser.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Keys pressed inside the preview never reach TermC's window; forward ⌘-shortcuts so they keep working.
  contents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.meta) return;
    if (['c', 'v', 'x', 'a', 'z'].includes(String(input.key).toLowerCase()) && !input.shift && !input.alt) return;
    send('preview:key', { code: input.code, key: input.key, metaKey: true, shiftKey: input.shift, altKey: input.alt, ctrlKey: input.control });
  });
});

app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault();
    requestQuit();
  }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
