// xterm instances live outside React so panes can move between splits/tabs without
// losing their screen. Each terminal owns a host <div> that gets re-parented on mount.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import { getState, setPaneInfo, findPaneAnywhere, focusPane, activePaneId, openPreview, saveSettings } from './store';
import { currentTheme } from './theme-registry';

const api = window.termc;
const registry = new Map();
let restoredBuffers = {};

export const setRestoredBuffers = (b) => (restoredBuffers = b || {});
export const get = (id) => registry.get(id);
export const has = (id) => registry.has(id);

api.pty.onData((id, data) => registry.get(id)?.term.write(data));
api.pty.onExit((id) => {
  const t = registry.get(id);
  if (!t || t.disposing) return;
  t.exited = true;
  t.term.write('\r\n\x1b[2m[process exited — press Enter to restart, or ⌘W to close]\x1b[0m\r\n');
});

function termOptions(s) {
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback,
    macOptionIsMeta: s.optionAsMeta,
    macOptionClickForcesSelection: true,
    allowProposedApi: true,
    drawBoldTextInBrightColors: false,
    minimumContrastRatio: 1,
    theme: currentTheme().term,
  };
}

export function ensure(id, { cwd, command } = {}) {
  if (registry.has(id)) return registry.get(id);
  const settings = getState().settings;
  const term = new Terminal(termOptions(settings));
  const fit = new FitAddon();
  const serialize = new SerializeAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(serialize);
  term.loadAddon(search);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((e, uri) => {
    // Plain click on localhost links opens the embedded preview; ⌘-click opens the system browser.
    if (!e.metaKey && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(uri)) openPreview(uri.replace('0.0.0.0', 'localhost'));
    else api.invoke('app:openExternal', uri);
  }));

  const host = document.createElement('div');
  host.className = 'xterm-host';
  const rec = { id, term, fit, serialize, search, host, opened: false, exited: false, cwd, command };
  registry.set(id, rec);

  const saved = restoredBuffers[id];
  if (saved) {
    term.write(saved.replace(/\r?\n/g, '\r\n'));
    term.write('\r\n\x1b[2m── restored session ──\x1b[0m\r\n');
    delete restoredBuffers[id];
  }

  term.onData((data) => {
    if (rec.exited) {
      if (data === '\r') restart(id);
      return;
    }
    api.pty.write(id, data);
  });
  term.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows));
  term.onSelectionChange(() => {
    if (getState().settings?.copyOnSelect && term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
  });
  term.textarea?.addEventListener('focus', () => onFocus(id));

  spawn(rec, cwd, command);
  return rec;
}

async function spawn(rec, cwd, command) {
  const info = await api.pty.create({ id: rec.id, cwd, cols: rec.term.cols, rows: rec.term.rows, command });
  if (info) setPaneInfo(rec.id, { cwd: info.cwd, process: info.process, pid: info.pid });
}

function restart(id) {
  const rec = registry.get(id);
  if (!rec) return;
  rec.exited = false;
  rec.term.reset();
  spawn(rec, getState().paneInfo[id]?.cwd || rec.cwd);
}

function onFocus(id) {
  const hit = findPaneAnywhere(id);
  if (hit && hit.tab.activePaneId !== id) focusPane(id);
  api.setActivePane({ id, cwd: getState().paneInfo[id]?.cwd });
}

export function attach(id, container) {
  const rec = registry.get(id);
  if (!rec) return;
  if (rec.host.parentElement !== container) container.appendChild(rec.host);
  if (!rec.opened) {
    rec.term.open(rec.host);
    rec.opened = true;
    rec.term.textarea?.addEventListener('focus', () => onFocus(id));
  }
  fitSoon(id);
}

export function fitSoon(id) {
  const rec = registry.get(id);
  if (!rec || !rec.opened) return;
  cancelAnimationFrame(rec.fitRaf);
  rec.fitRaf = requestAnimationFrame(() => {
    if (!rec.host.isConnected || rec.host.clientWidth < 20 || rec.host.clientHeight < 20) return;
    try {
      rec.fit.fit();
    } catch {}
  });
}

export function focus(id) {
  const rec = id && registry.get(id);
  if (rec?.opened) rec.term.focus();
}

export function dispose(id) {
  const rec = registry.get(id);
  if (!rec) return;
  rec.disposing = true;
  registry.delete(id);
  api.pty.kill(id);
  rec.term.dispose();
  rec.host.remove();
}

export function write(id, text) {
  api.pty.write(id || activePaneId(), text);
}

// Paste like the user would, so bracketed-paste aware programs (Claude Code) treat it as a paste.
export function paste(id, text) {
  const rec = registry.get(id || activePaneId());
  if (!rec) return;
  rec.term.paste(text);
  rec.term.focus();
}

export function clear(id) {
  const rec = registry.get(id || activePaneId());
  if (!rec) return;
  rec.term.clear();
  api.pty.write(rec.id, '\x0c');
}

export function serializeAll() {
  const out = {};
  for (const [id, rec] of registry) {
    try {
      out[id] = rec.serialize.serialize({ scrollback: 1000, excludeAltBuffer: true, excludeModes: true });
    } catch {}
  }
  return out;
}

export function applySettings(settings) {
  const opts = termOptions(settings);
  for (const rec of registry.values()) {
    for (const [k, v] of Object.entries(opts)) rec.term.options[k] = v;
    fitSoon(rec.id);
  }
}

export function applyTheme() {
  const theme = currentTheme().term;
  for (const rec of registry.values()) rec.term.options.theme = theme;
}

export function adjustFont(delta) {
  const s = getState().settings;
  const size = delta === 0 ? 13 : Math.min(32, Math.max(8, s.fontSize + delta));
  saveSettings({ fontSize: size });
}
