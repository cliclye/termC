import { useSyncExternalStore } from 'react';
import { rid, newPane, panesOf, findPane, splitAt, removePane, setRatio, equalize, parentSplit, neighbor } from './layout';
import * as terminals from './terminals';

const api = window.termc;
const HOME_GUESS = '~';

export const WORKSPACE_COLORS = ['#7c9cff', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#f472b6', '#2dd4bf', '#a3a3a3'];

let state = {
  ready: false,
  settings: null,
  appInfo: null,
  workspaces: [],
  activeWorkspaceId: null,
  paneInfo: {},
  sidebar: { open: true, view: 'files', width: 300 },
  preview: { open: false, url: '', width: 560 },
  devServers: [],
  overlay: null,
  toasts: [],
  resumeOffers: {},
  contextMenu: null,
  revealPath: null,
  plugin: { statusItems: {}, panels: {}, commands: {}, contextMenu: {}, keybindings: [], themes: {} },
};

const listeners = new Set();
export const getState = () => state;
export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  if (!next) return;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (state.ready) scheduleSave();
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useStore = (sel) => useSyncExternalStore(subscribe, () => sel(state));

// ---- selectors ----
export const activeWorkspace = (s = state) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) || s.workspaces[0];
export const activeTab = (s = state) => {
  const w = activeWorkspace(s);
  return w && (w.tabs.find((t) => t.id === w.activeTabId) || w.tabs[0]);
};
export const activePaneId = (s = state) => activeTab(s)?.activePaneId;
export const paneCwd = (id, s = state) => s.paneInfo[id]?.cwd || findPaneAnywhere(id, s)?.pane.cwd;
export const activeCwd = (s = state) => paneCwd(activePaneId(s), s) || s.appInfo?.homeDir || HOME_GUESS;

export function findPaneAnywhere(id, s = state) {
  for (const w of s.workspaces) for (const t of w.tabs) {
    const pane = findPane(t.root, id);
    if (pane) return { workspace: w, tab: t, pane };
  }
  return null;
}

export function allPanes(s = state) {
  const out = [];
  for (const w of s.workspaces) for (const t of w.tabs) for (const p of panesOf(t.root)) out.push({ workspace: w, tab: t, pane: p });
  return out;
}

// ---- mutation helpers ----
function updateWorkspace(wsId, fn) {
  setState((s) => ({ workspaces: s.workspaces.map((w) => (w.id === wsId ? fn(w) : w)) }));
}
function updateTab(tabId, fn) {
  setState((s) => ({ workspaces: s.workspaces.map((w) => ({ ...w, tabs: w.tabs.map((t) => (t.id === tabId ? fn(t) : t)) })) }));
}

export function toast(message, opts = {}) {
  const id = rid('n');
  setState((s) => ({ toasts: [...s.toasts, { id, message, kind: opts.kind || 'info', actions: opts.actions || [], title: opts.title }] }));
  if (opts.timeout !== 0) setTimeout(() => dismissToast(id), opts.timeout || 4500);
  return id;
}
export function dismissToast(id) {
  // Mark as leaving so it can animate out, then remove.
  setState((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 200);
}

// ---- workspaces ----
export function createWorkspace({ name, cwd, color } = {}) {
  const dir = cwd || activeCwd();
  const base = name || dir.split('/').filter(Boolean).pop() || 'workspace';
  const pane = newPane(dir);
  const tab = { id: rid('t'), title: '', root: pane, activePaneId: pane.id };
  const ws = { id: rid('w'), name: base, color: color || WORKSPACE_COLORS[state.workspaces.length % WORKSPACE_COLORS.length], cwd: dir, tabs: [tab], activeTabId: tab.id };
  setState((s) => ({ workspaces: [...s.workspaces, ws], activeWorkspaceId: ws.id }));
  return ws;
}
export const switchWorkspace = (id) => setState({ activeWorkspaceId: id });
export const renameWorkspace = (id, name) => updateWorkspace(id, (w) => ({ ...w, name }));
export const setWorkspaceColor = (id, color) => updateWorkspace(id, (w) => ({ ...w, color }));
export function deleteWorkspace(id) {
  const ws = state.workspaces.find((w) => w.id === id);
  if (!ws) return;
  for (const t of ws.tabs) panesOf(t.root).forEach((p) => terminals.dispose(p.id));
  const rest = state.workspaces.filter((w) => w.id !== id);
  setState({ workspaces: rest, activeWorkspaceId: state.activeWorkspaceId === id ? rest[0]?.id : state.activeWorkspaceId });
  if (!rest.length) createWorkspace({ cwd: ws.cwd });
}
export function moveWorkspace(id, toIndex) {
  setState((s) => {
    const list = [...s.workspaces];
    const from = list.findIndex((w) => w.id === id);
    const [w] = list.splice(from, 1);
    list.splice(toIndex, 0, w);
    return { workspaces: list };
  });
}

// ---- tabs ----
export function createTab({ cwd, command, title, workspaceId } = {}) {
  const ws = workspaceId ? state.workspaces.find((w) => w.id === workspaceId) : activeWorkspace();
  if (!ws) return createWorkspace({ cwd }).tabs[0];
  const pane = newPane(cwd || activeCwd() || ws.cwd, command);
  const tab = { id: rid('t'), title: title || '', root: pane, activePaneId: pane.id };
  updateWorkspace(ws.id, (w) => ({ ...w, tabs: [...w.tabs, tab], activeTabId: tab.id }));
  setState({ activeWorkspaceId: ws.id });
  return tab;
}
export function closeTab(tabId) {
  const ws = state.workspaces.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!ws) return;
  const idx = ws.tabs.findIndex((t) => t.id === tabId);
  panesOf(ws.tabs[idx].root).forEach((p) => terminals.dispose(p.id));
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  if (!tabs.length) {
    if (state.workspaces.length > 1) return deleteWorkspace(ws.id);
    const pane = newPane(ws.cwd);
    tabs.push({ id: rid('t'), title: '', root: pane, activePaneId: pane.id });
  }
  updateWorkspace(ws.id, (w) => ({ ...w, tabs, activeTabId: w.activeTabId === tabId ? tabs[Math.min(idx, tabs.length - 1)].id : w.activeTabId }));
}
export function switchTab(tabId) {
  const ws = state.workspaces.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!ws) return;
  updateWorkspace(ws.id, (w) => ({ ...w, activeTabId: tabId }));
  setState({ activeWorkspaceId: ws.id });
}
export function cycleTab(delta) {
  const ws = activeWorkspace();
  if (!ws) return;
  const i = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
  switchTab(ws.tabs[(i + delta + ws.tabs.length) % ws.tabs.length].id);
}
export const renameTab = (tabId, title) => updateTab(tabId, (t) => ({ ...t, title }));
export function moveTab(tabId, toIndex) {
  const ws = state.workspaces.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!ws) return;
  updateWorkspace(ws.id, (w) => {
    const tabs = [...w.tabs];
    const from = tabs.findIndex((t) => t.id === tabId);
    const [t] = tabs.splice(from, 1);
    tabs.splice(toIndex, 0, t);
    return { ...w, tabs };
  });
}

// ---- panes ----
export function focusPane(paneId) {
  const hit = findPaneAnywhere(paneId);
  if (!hit) return false;
  updateWorkspace(hit.workspace.id, (w) => ({ ...w, activeTabId: hit.tab.id }));
  updateTab(hit.tab.id, (t) => ({ ...t, activePaneId: paneId }));
  setState({ activeWorkspaceId: hit.workspace.id });
  requestAnimationFrame(() => terminals.focus(paneId));
  return true;
}

// dir: 'row' = side by side, 'column' = stacked
export function splitPane(paneId, dir, { cwd, command, before = false } = {}) {
  const id = paneId || activePaneId();
  const hit = findPaneAnywhere(id);
  if (!hit) return null;
  const pane = newPane(cwd || paneCwd(id) || hit.pane.cwd, command);
  updateTab(hit.tab.id, (t) => ({ ...t, root: splitAt(t.root, id, dir, pane, before), activePaneId: pane.id, zoomed: null }));
  requestAnimationFrame(() => terminals.focus(pane.id));
  return pane;
}

export function closePane(paneId) {
  const id = paneId || activePaneId();
  const hit = findPaneAnywhere(id);
  if (!hit) return;
  terminals.dispose(id);
  const root = removePane(hit.tab.root, id);
  if (!root) return closeTab(hit.tab.id);
  const next = panesOf(root)[0].id;
  updateTab(hit.tab.id, (t) => ({ ...t, root, activePaneId: t.activePaneId === id ? next : t.activePaneId, zoomed: t.zoomed === id ? null : t.zoomed }));
  setState((s) => {
    const { [id]: _, ...rest } = s.resumeOffers;
    return { resumeOffers: rest };
  });
  if (hit.tab.id === activeTab()?.id) requestAnimationFrame(() => terminals.focus(activePaneId()));
}

// Move pane `src` next to pane `target` on `edge` ('left'|'right'|'top'|'bottom'), possibly across tabs.
export function movePane(src, target, edge) {
  if (src === target) return;
  const a = findPaneAnywhere(src);
  const b = findPaneAnywhere(target);
  if (!a || !b) return;
  const node = a.pane;
  const srcRoot = removePane(a.tab.root, src);
  setState((s) => ({
    workspaces: s.workspaces.map((w) => ({
      ...w,
      tabs: w.tabs
        .map((t) => {
          let root = t.root;
          if (t.id === a.tab.id) root = srcRoot;
          if (t.id === b.tab.id) root = splitAt(root, target, edge === 'left' || edge === 'right' ? 'row' : 'column', node, edge === 'left' || edge === 'top');
          if (!root) return null;
          const activePaneId = t.id === b.tab.id ? src : findPane(root, t.activePaneId) ? t.activePaneId : panesOf(root)[0].id;
          return { ...t, root, activePaneId, zoomed: null };
        })
        .filter(Boolean),
    })),
  }));
  // A tab emptied by the move disappears; keep each workspace's active tab valid.
  setState((s) => ({ workspaces: s.workspaces.map((w) => (w.tabs.some((t) => t.id === w.activeTabId) ? w : { ...w, activeTabId: w.tabs[0]?.id })) }));
  focusPane(src);
}

export function resizeSplit(splitId, ratio) {
  const t = activeTab();
  if (t) updateTab(t.id, (tab) => ({ ...tab, root: setRatio(tab.root, splitId, ratio) }));
}
export function resizePane(paneId, ratio) {
  const hit = findPaneAnywhere(paneId || activePaneId());
  const parent = hit && parentSplit(hit.tab.root, hit.pane.id);
  if (!parent) return false;
  const r = parent.a.type === 'pane' && parent.a.id === hit.pane.id ? ratio : 1 - ratio;
  updateTab(hit.tab.id, (t) => ({ ...t, root: setRatio(t.root, parent.id, r) }));
  return true;
}
export function equalizePanes() {
  const t = activeTab();
  if (t) updateTab(t.id, (tab) => ({ ...tab, root: equalize(tab.root) }));
}
export function toggleZoom(paneId) {
  const t = activeTab();
  if (!t) return;
  const id = paneId || t.activePaneId;
  updateTab(t.id, (tab) => ({ ...tab, zoomed: tab.zoomed ? null : id }));
  requestAnimationFrame(() => terminals.focus(id));
}
export function focusDirection(direction) {
  const t = activeTab();
  if (!t) return;
  const n = neighbor(t.root, t.activePaneId, direction);
  if (n) focusPane(n);
}

export function setPaneInfo(id, patch) {
  setState((s) => ({ paneInfo: { ...s.paneInfo, [id]: { ...s.paneInfo[id], ...patch } } }));
}

// ---- UI ----
export const openOverlay = (overlay) => setState({ overlay });
export const closeOverlay = () => {
  setState({ overlay: null });
  requestAnimationFrame(() => terminals.focus(activePaneId()));
};
export function toggleSidebar(view) {
  setState((s) => ({ sidebar: { ...s.sidebar, open: view ? !(s.sidebar.open && s.sidebar.view === view) : !s.sidebar.open, view: view || s.sidebar.view } }));
}
export function showSidebar(view) {
  setState((s) => ({ sidebar: { ...s.sidebar, open: true, view } }));
}
export function openPreview(url) {
  setState((s) => ({ preview: { ...s.preview, open: true, url: url || s.preview.url || s.devServers[0]?.url || '' } }));
}
export const closePreview = () => setState((s) => ({ preview: { ...s.preview, open: false } }));

export async function saveSettings(patch) {
  const settings = await api.invoke('settings:set', patch);
  setState({ settings });
  terminals.applySettings(settings);
  return settings;
}

// ---- persistence ----
let saveTimer = null;
function snapshot() {
  const strip = (n) => (n.type === 'pane' ? { type: 'pane', id: n.id, cwd: state.paneInfo[n.id]?.cwd || n.cwd } : { ...n, a: strip(n.a), b: strip(n.b) });
  const ai = {};
  for (const [id, info] of Object.entries(state.paneInfo)) if (info.ai) ai[id] = info.ai;
  return {
    version: 1,
    workspaces: state.workspaces.map((w) => ({ ...w, tabs: w.tabs.map((t) => ({ ...t, root: strip(t.root) })) })),
    activeWorkspaceId: state.activeWorkspaceId,
    sidebar: state.sidebar,
    preview: { ...state.preview, open: state.preview.open },
    ai,
  };
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.invoke('state:save', { state: snapshot() }), 800);
}
export async function saveAll() {
  clearTimeout(saveTimer);
  await api.invoke('state:save', { state: snapshot(), buffers: state.settings?.restoreSessions ? terminals.serializeAll() : {} });
}
