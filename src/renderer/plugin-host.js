// Runs each enabled plugin in its own Web Worker and serves its API over postMessage.
import * as S from './store';
import * as terminals from './terminals';
import { applyCurrentTheme } from './theme-registry';
import { runCommand } from './commands';

const api = window.termc;
const workers = new Map(); // id -> { worker, manifest }

// Code that runs inside the worker before the plugin. Exposes the `termc` global.
const BOOTSTRAP = `
const __pending = new Map();
let __seq = 0;
const __handlers = { commands: {}, contextMenu: {}, events: {}, panels: {} };
const __call = (method, args) => new Promise((resolve, reject) => {
  const id = ++__seq;
  __pending.set(id, { resolve, reject });
  postMessage({ type: 'call', id, method, args });
});
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'result') {
    const p = __pending.get(m.id);
    if (!p) return;
    __pending.delete(m.id);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
  } else if (m.type === 'command') {
    try { await __handlers.commands[m.id]?.(m.args); } catch (err) { console.error(err); }
  } else if (m.type === 'contextMenu') {
    try { await __handlers.contextMenu[m.id]?.(m.context); } catch (err) { console.error(err); }
  } else if (m.type === 'panelMessage') {
    (__handlers.panels[m.panel] || []).forEach((fn) => fn(m.data));
  } else if (m.type === 'event') {
    (__handlers.events[m.name] || []).forEach((fn) => fn(m.payload));
  }
};
const termc = {
  commands: {
    register: (id, title, handler) => { __handlers.commands[id] = handler; return __call('commands.register', { id, title }); },
    execute: (id) => __call('commands.execute', { id }),
  },
  terminal: {
    active: () => __call('terminal.active', {}),
    list: () => __call('terminal.list', {}),
    write: (text, paneId) => __call('terminal.write', { text, paneId }),
    paste: (text, paneId) => __call('terminal.paste', { text, paneId }),
    run: (command, paneId) => __call('terminal.run', { command, paneId }),
    read: (lines, paneId) => __call('terminal.read', { lines, paneId }),
    create: (opts) => __call('terminal.create', opts || {}),
    split: (opts) => __call('terminal.split', opts || {}),
  },
  notifications: {
    show: (message, opts) => __call('notifications.show', { message, ...(opts || {}) }),
  },
  exec: (command, opts) => __call('exec', { command, ...(opts || {}) }),
  fs: {
    readFile: (path) => __call('fs.readFile', { path }),
    writeFile: (path, content) => __call('fs.writeFile', { path, content }),
    readDir: (path) => __call('fs.readDir', { path }),
    exists: (path) => __call('fs.exists', { path }),
  },
  statusBar: {
    set: (id, item) => __call('statusBar.set', { id, ...item }),
    remove: (id) => __call('statusBar.remove', { id }),
  },
  http: { fetch: (url, opts) => __call('http.fetch', { url, ...(opts || {}) }) },
  storage: {
    get: (key) => __call('storage.get', { key }),
    set: (key, value) => __call('storage.set', { key, value }),
    keys: () => __call('storage.keys', {}),
  },
  panels: {
    register: (id, opts) => __call('panels.register', { id, ...opts }),
    update: (id, html) => __call('panels.update', { id, html }),
    postMessage: (id, data) => __call('panels.postMessage', { id, data }),
    onMessage: (id, fn) => { (__handlers.panels[id] ||= []).push(fn); },
  },
  contextMenu: {
    register: (id, label, handler) => { __handlers.contextMenu[id] = handler; return __call('contextMenu.register', { id, label }); },
  },
  keybindings: { register: (key, commandId) => __call('keybindings.register', { key, commandId }) },
  themes: { register: (theme) => __call('themes.register', theme) },
  ui: {
    prompt: (title, opts) => __call('ui.prompt', { title, ...(opts || {}) }),
    pick: (items, opts) => __call('ui.pick', { items, ...(opts || {}) }),
  },
  app: { state: () => __call('app.state', {}) },
  events: { on: (name, fn) => { (__handlers.events[name] ||= []).push(fn); } },
};
self.termc = termc;
`;

function paneTarget(paneId) {
  return paneId || S.activePaneId();
}

async function handleCall(pluginId, manifest, method, args) {
  const ns = (k) => `${pluginId}.${k}`;
  const patchPlugin = (fn) => S.setState((s) => ({ plugin: { ...s.plugin, ...fn(s.plugin) } }));
  switch (method) {
    case 'commands.register':
      patchPlugin((p) => ({
        commands: { ...p.commands, [ns(args.id)]: { id: ns(args.id), title: args.title, category: manifest.name, plugin: pluginId, run: (a) => workers.get(pluginId)?.worker.postMessage({ type: 'command', id: args.id, args: a }) } },
      }));
      return true;
    case 'commands.execute':
      return runCommand(args.id);
    case 'terminal.active': {
      const id = S.activePaneId();
      return { id, ...S.getState().paneInfo[id] };
    }
    case 'terminal.list':
      return S.allPanes().map(({ pane, tab, workspace }) => ({ id: pane.id, tab: tab.id, workspace: workspace.name, ...S.getState().paneInfo[pane.id] }));
    case 'terminal.write':
      terminals.write(paneTarget(args.paneId), args.text);
      return true;
    case 'terminal.paste':
      terminals.paste(paneTarget(args.paneId), args.text);
      return true;
    case 'terminal.run':
      terminals.write(paneTarget(args.paneId), args.command + '\r');
      return true;
    case 'terminal.read':
      return api.pty.read(paneTarget(args.paneId), args.lines || 50);
    case 'terminal.create':
      return S.createTab({ cwd: args.cwd, command: args.command, title: args.title }).activePaneId;
    case 'terminal.split':
      return S.splitPane(args.paneId, args.direction === 'vertical' ? 'column' : 'row', { cwd: args.cwd, command: args.command })?.id;
    case 'notifications.show':
      if (args.system) return api.invoke('app:notify', { title: args.title || manifest.name, body: args.message });
      S.toast(args.message, { title: args.title || manifest.name, kind: args.kind });
      return true;
    case 'statusBar.set':
      patchPlugin((p) => ({ statusItems: { ...p.statusItems, [ns(args.id)]: { ...args, plugin: pluginId, key: ns(args.id), command: args.command ? ns(args.command) : null } } }));
      return true;
    case 'statusBar.remove':
      patchPlugin((p) => {
        const { [ns(args.id)]: _, ...rest } = p.statusItems;
        return { statusItems: rest };
      });
      return true;
    case 'panels.register':
    case 'panels.update':
      patchPlugin((p) => ({
        panels: { ...p.panels, [ns(args.id)]: { ...(p.panels[ns(args.id)] || {}), id: ns(args.id), localId: args.id, plugin: pluginId, title: args.title || p.panels[ns(args.id)]?.title, icon: args.icon || p.panels[ns(args.id)]?.icon, html: args.html } },
      }));
      return true;
    case 'panels.postMessage':
      window.dispatchEvent(new CustomEvent('termc-panel-message', { detail: { panel: ns(args.id), data: args.data } }));
      return true;
    case 'contextMenu.register':
      patchPlugin((p) => ({ contextMenu: { ...p.contextMenu, [ns(args.id)]: { id: args.id, label: args.label, plugin: pluginId } } }));
      return true;
    case 'keybindings.register':
      patchPlugin((p) => ({ keybindings: [...p.keybindings.filter((k) => k.key !== args.key), { key: args.key, command: args.commandId.includes('.') ? args.commandId : ns(args.commandId), plugin: pluginId }] }));
      return true;
    case 'themes.register': {
      const theme = { ...args, id: args.id, plugin: pluginId };
      patchPlugin((p) => ({ themes: { ...p.themes, [theme.id]: theme } }));
      if (S.getState().settings.theme === theme.id) {
        applyCurrentTheme();
        terminals.applyTheme();
      }
      return true;
    }
    case 'ui.prompt':
      return new Promise((resolve) => S.openOverlay({ type: 'prompt', title: args.title, placeholder: args.placeholder, value: args.value || '', onSubmit: resolve, onCancel: () => resolve(null) }));
    case 'ui.pick':
      return new Promise((resolve) => S.openOverlay({ type: 'pick', title: args.title, items: args.items, onSubmit: resolve, onCancel: () => resolve(null) }));
    case 'app.state': {
      const s = S.getState();
      return { workspace: S.activeWorkspace()?.name, cwd: S.activeCwd(), theme: s.settings.theme, devServers: s.devServers };
    }
    default:
      // storage, exec, fs, http: privileged, checked against manifest permissions in the main process.
      return api.invoke('plugins:api', pluginId, method, args);
  }
}

function unregisterUi(pluginId) {
  S.setState((s) => {
    const keep = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v.plugin !== pluginId));
    return {
      plugin: {
        statusItems: keep(s.plugin.statusItems),
        panels: keep(s.plugin.panels),
        commands: keep(s.plugin.commands),
        contextMenu: keep(s.plugin.contextMenu),
        themes: keep(s.plugin.themes),
        keybindings: s.plugin.keybindings.filter((k) => k.plugin !== pluginId),
      },
    };
  });
}

export async function startPlugin(manifest) {
  stopPlugin(manifest.id);
  const source = await api.invoke('plugins:source', manifest.id);
  const blob = new Blob([BOOTSTRAP, '\n;(async () => {\n', source, '\n})().catch((e) => console.error(e));'], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { name: `plugin:${manifest.id}` });
  URL.revokeObjectURL(url);
  worker.onmessage = async (e) => {
    const m = e.data;
    if (m.type !== 'call') return;
    try {
      const result = await handleCall(manifest.id, manifest, m.method, m.args || {});
      worker.postMessage({ type: 'result', id: m.id, result });
    } catch (err) {
      worker.postMessage({ type: 'result', id: m.id, error: err.message || String(err) });
    }
  };
  worker.onerror = (e) => {
    console.error(`[plugin ${manifest.id}]`, e.message);
    S.toast(`${manifest.name}: ${e.message}`, { kind: 'error' });
  };
  workers.set(manifest.id, { worker, manifest });
}

export function stopPlugin(id) {
  const w = workers.get(id);
  if (w) {
    w.worker.terminate();
    workers.delete(id);
  }
  unregisterUi(id);
}

export function runningPlugins() {
  return [...workers.keys()];
}

export async function startEnabledPlugins() {
  const installed = await api.invoke('plugins:installed');
  const enabled = S.getState().settings.enabledPlugins || {};
  for (const m of installed) if (enabled[m.id] !== false) startPlugin(m).catch((e) => console.error(e));
}

export async function setPluginEnabled(id, on) {
  const s = S.getState().settings;
  await S.saveSettings({ enabledPlugins: { ...s.enabledPlugins, [id]: on } });
  if (on) {
    const m = (await api.invoke('plugins:installed')).find((x) => x.id === id);
    if (m) await startPlugin(m);
  } else stopPlugin(id);
}

export function broadcast(name, payload) {
  for (const { worker } of workers.values()) worker.postMessage({ type: 'event', name, payload });
}

export function sendContextMenu(key, context) {
  const item = S.getState().plugin.contextMenu[key];
  workers.get(item?.plugin)?.worker.postMessage({ type: 'contextMenu', id: item.id, context });
}

export function sendPanelMessage(panelKey, data) {
  const panel = S.getState().plugin.panels[panelKey];
  workers.get(panel?.plugin)?.worker.postMessage({ type: 'panelMessage', panel: panel.localId, data });
}

