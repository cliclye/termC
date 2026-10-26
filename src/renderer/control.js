// Executes MCP tool calls forwarded by the main process.
import * as S from './store';
import * as terminals from './terminals';
import { panesOf } from './layout';
import { allCommands, runCommand } from './commands';
import { allThemes } from './theme-registry';
import { setPluginEnabled } from './plugin-host';
import { fuzzyFilter } from './fuzzy';

const api = window.termc;

const KEYS = { enter: '\r', 'ctrl+c': '\x03', 'ctrl+d': '\x04', 'ctrl+z': '\x1a', 'ctrl+l': '\x0c', 'ctrl+a': '\x01', 'ctrl+e': '\x05', 'ctrl+u': '\x15', 'ctrl+r': '\x12', esc: '\x1b', escape: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', backspace: '\x7f', space: ' ' };

function pane(params) {
  const id = params.paneId || S.activePaneId();
  if (!id || !S.findPaneAnywhere(id)) throw new Error(`No such pane: ${params.paneId || '(none focused)'}`);
  return id;
}
const cwdOf = (params) => params.cwd || S.activeCwd();
const resolvePath = (p, base) => (p.startsWith('/') ? p : p.startsWith('~/') ? p.replace('~', S.getState().appInfo.homeDir) : `${base.replace(/\/$/, '')}/${p}`);

function paneSummary({ workspace, tab, pane: p }) {
  const info = S.getState().paneInfo[p.id] || {};
  return {
    paneId: p.id,
    workspace: workspace.name,
    workspaceId: workspace.id,
    tabId: tab.id,
    tabTitle: tab.title || null,
    cwd: info.cwd || p.cwd,
    process: info.process,
    running: !!info.running,
    aiTool: info.ai?.name || null,
    focused: p.id === S.activePaneId() && workspace.id === S.getState().activeWorkspaceId,
  };
}

function waitForPty(id, ms = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = async () => {
      if ((await api.pty.info(id)) || Date.now() - start > ms) return resolve();
      setTimeout(tick, 100);
    };
    tick();
  });
}

function workspaceBy(params) {
  const s = S.getState();
  const w = params.workspaceId ? s.workspaces.find((x) => x.id === params.workspaceId) : params.name ? s.workspaces.find((x) => x.name.toLowerCase() === params.name.toLowerCase()) : S.activeWorkspace();
  if (!w) throw new Error('Workspace not found');
  return w;
}

function tabBy(params) {
  const w = S.activeWorkspace();
  const t = params.tabId ? S.getState().workspaces.flatMap((x) => x.tabs).find((x) => x.id === params.tabId) : params.index ? w.tabs[params.index - 1] : S.activeTab();
  if (!t) throw new Error('Tab not found');
  return t;
}

const handlers = {
  // terminals
  terminal_list: () => S.allPanes().map(paneSummary),
  terminal_create: async (p) => {
    const tab = S.createTab({ cwd: p.cwd, command: p.command, title: p.title, workspaceId: p.workspaceId });
    await waitForPty(tab.activePaneId);
    return { paneId: tab.activePaneId, tabId: tab.id };
  },
  terminal_run: async (p) => {
    const id = pane(p);
    if (p.wait === false) {
      terminals.write(id, p.command + '\r');
      return { paneId: id, started: true };
    }
    const info = S.getState().paneInfo[id] || {};
    if (info.running) throw new Error(`Pane ${id} is busy running "${info.process}". Use another pane, terminal_interrupt, or wait:false.`);
    const r = await api.pty.runAndWait(id, p.command, p.timeout || 60000);
    return { paneId: id, ...r };
  },
  terminal_write: (p) => (terminals.write(pane(p), p.text), { ok: true }),
  terminal_send_keys: (p) => {
    const id = pane(p);
    for (const k of p.keys) {
      const seq = KEYS[String(k).toLowerCase()];
      if (seq === undefined) throw new Error(`Unknown key "${k}". Known: ${Object.keys(KEYS).join(', ')}`);
      terminals.write(id, seq);
    }
    return { ok: true };
  },
  terminal_read: (p) => api.pty.read(pane(p), p.lines || 100),
  terminal_search_output: async (p) => {
    const text = (await api.pty.read(pane(p), 5000)) || '';
    const re = new RegExp(p.pattern);
    return text.split('\n').map((line, i) => ({ line: i + 1, text: line })).filter((l) => re.test(l.text)).slice(-100);
  },
  terminal_wait_for: (p) => api.pty.waitFor(pane(p), p.pattern, p.timeout || 30000),
  terminal_interrupt: (p) => (terminals.write(pane(p), '\x03'), { ok: true }),
  terminal_clear: (p) => (terminals.clear(pane(p)), { ok: true }),
  terminal_close: (p) => (S.closePane(pane(p)), { ok: true }),
  terminal_focus: (p) => ({ ok: S.focusPane(pane(p)) }),
  terminal_get_info: async (p) => ({ ...(await api.pty.info(pane(p))), ...paneSummary(S.findPaneAnywhere(pane(p))) }),
  terminal_rename: (p) => (S.renameTab(S.findPaneAnywhere(pane(p)).tab.id, p.title), { ok: true }),
  // panes
  pane_split: async (p) => {
    const n = S.splitPane(pane(p), p.direction === 'vertical' ? 'column' : 'row', { cwd: p.cwd, command: p.command });
    await waitForPty(n.id);
    return { paneId: n.id };
  },
  pane_list: () => {
    const t = S.activeTab();
    const describe = (n) => (n.type === 'pane' ? { paneId: n.id, cwd: S.paneCwd(n.id) } : { split: n.dir === 'row' ? 'horizontal' : 'vertical', ratio: n.ratio, first: describe(n.a), second: describe(n.b) });
    return { tabId: t.id, focused: t.activePaneId, zoomed: t.zoomed || null, layout: describe(t.root) };
  },
  pane_focus_direction: (p) => (S.focusDirection(p.direction), { focused: S.activePaneId() }),
  pane_zoom: (p) => (S.focusPane(pane(p)), S.toggleZoom(pane(p)), { zoomed: !!S.activeTab().zoomed }),
  pane_resize: (p) => ({ ok: S.resizePane(pane(p), p.ratio) }),
  pane_equalize: () => (S.equalizePanes(), { ok: true }),
  // tabs
  tab_list: (p) => {
    const w = workspaceBy(p);
    return w.tabs.map((t, i) => ({ tabId: t.id, index: i + 1, title: t.title || null, active: t.id === w.activeTabId, panes: panesOf(t.root).map((x) => x.id) }));
  },
  tab_create: async (p) => {
    const t = S.createTab(p);
    await waitForPty(t.activePaneId);
    return { tabId: t.id, paneId: t.activePaneId };
  },
  tab_close: (p) => (S.closeTab(tabBy(p).id), { ok: true }),
  tab_focus: (p) => (S.switchTab(tabBy(p).id), { ok: true }),
  tab_rename: (p) => (S.renameTab(tabBy(p).id, p.title), { ok: true }),
  // workspaces
  workspace_list: () => S.getState().workspaces.map((w) => ({ workspaceId: w.id, name: w.name, color: w.color, cwd: w.cwd, tabs: w.tabs.length, active: w.id === S.getState().activeWorkspaceId })),
  workspace_create: async (p) => {
    const w = S.createWorkspace({ name: p.name, cwd: p.cwd, color: p.color });
    return { workspaceId: w.id, paneId: w.tabs[0].activePaneId };
  },
  workspace_switch: (p) => (S.switchWorkspace(workspaceBy(p).id), { ok: true }),
  workspace_rename: (p) => (S.renameWorkspace(workspaceBy({ workspaceId: p.workspaceId }).id, p.name), { ok: true }),
  workspace_set_color: (p) => (S.setWorkspaceColor(workspaceBy(p).id, p.color), { ok: true }),
  workspace_delete: (p) => (S.deleteWorkspace(workspaceBy(p).id), { ok: true }),
  // git
  git_status: (p) => api.invoke('git:status', cwdOf(p)),
  git_diff: (p) => api.invoke('git:diff', cwdOf(p), p.file, !!p.staged, false),
  git_log: async (p) => (await api.invoke('git:log', cwdOf(p), p.limit || 30)).map((c) => ({ hash: c.hash.slice(0, 10), subject: c.subject, author: c.author, date: c.date, refs: c.refs })),
  git_show: (p) => api.invoke('git:show', cwdOf(p), p.hash),
  git_branches: (p) => api.invoke('git:branches', cwdOf(p)),
  git_checkout: (p) => api.invoke('git:checkout', cwdOf(p), p.branch, { create: !!p.create }),
  git_stage: (p) => api.invoke('git:stage', cwdOf(p), p.files),
  git_unstage: (p) => api.invoke('git:unstage', cwdOf(p), p.files),
  git_commit: (p) => api.invoke('git:commit', cwdOf(p), p.message, { all: !!p.all, amend: !!p.amend }),
  git_push: (p) => api.invoke('git:remote', cwdOf(p), 'push'),
  git_pull: (p) => api.invoke('git:remote', cwdOf(p), 'pull'),
  git_fetch: (p) => api.invoke('git:remote', cwdOf(p), 'fetch'),
  git_worktree_list: (p) => api.invoke('git:worktrees', cwdOf(p)),
  git_worktree_add: async (p) => {
    const path = await api.invoke('git:worktreeAdd', cwdOf(p), { branch: p.branch, path: p.path });
    let paneId = null;
    if (p.open !== false) paneId = S.createTab({ cwd: path, title: p.branch }).activePaneId;
    return { path, paneId };
  },
  git_worktree_remove: (p) => api.invoke('git:worktreeRemove', cwdOf(p), p.path, !!p.force),
  // files
  file_list: async (p) => (await api.invoke('fs:list', p.path ? resolvePath(p.path, S.activeCwd()) : S.activeCwd(), !!p.hidden)).entries.map((e) => (e.isDir ? e.name + '/' : e.name)),
  file_read: (p) => api.invoke('fs:read', resolvePath(p.path, S.activeCwd())),
  file_search: async (p) => {
    const { root, files } = await api.invoke('fs:projectFiles', cwdOf(p));
    return { root, matches: fuzzyFilter(files, p.query, (f) => f).slice(0, p.limit || 30).map((m) => m.item) };
  },
  file_insert_path: (p) => (terminals.paste(pane(p), shellQuote(p.path) + ' '), { ok: true }),
  file_reveal: (p) => (S.showSidebar('files'), S.setState({ revealPath: resolvePath(p.path, S.activeCwd()) }), { ok: true }),
  // dev servers
  devserver_list: () => S.getState().devServers,
  preview_open: (p) => (S.openPreview(p.url), { ok: true }),
  preview_close: () => (S.closePreview(), { ok: true }),
  preview_reload: () => (window.dispatchEvent(new Event('termc-preview-reload')), { ok: true }),
  run_commands_list: async (p) => (await api.invoke('runner:detect', cwdOf(p))).groups.map((g) => ({ source: g.source, dir: g.dir, commands: g.items.map((i) => ({ name: i.name, command: i.command })) })),
  run_command: async (p) => {
    const { groups } = await api.invoke('runner:detect', cwdOf(p));
    for (const g of groups) {
      if (p.source && !g.kind.includes(p.source) && !g.source.includes(p.source)) continue;
      const item = g.items.find((i) => i.name === p.name);
      if (item) {
        const n = S.splitPane(null, 'row', { cwd: g.dir, command: item.command });
        return { paneId: n.id, command: item.command };
      }
    }
    throw new Error(`No detected command named "${p.name}"`);
  },
  // AI sessions
  ai_sessions_list: (p) => api.invoke('aiSessions:forCwd', cwdOf(p)),
  ai_session_resume: (p) => ({ paneId: S.createTab({ cwd: cwdOf(p), command: p.command }).activePaneId }),
  // app
  alias_list: () => api.invoke('aliases:list'),
  alias_set: async (p) => {
    const list = (await api.invoke('aliases:list')).filter((a) => a.name !== p.name);
    return api.invoke('aliases:save', [...list, { name: p.name, command: p.command }]);
  },
  alias_remove: async (p) => api.invoke('aliases:save', (await api.invoke('aliases:list')).filter((a) => a.name !== p.name)),
  theme_list: () => allThemes().map((t) => ({ id: t.id, name: t.name, active: t.id === S.getState().settings.theme })),
  theme_set: async (p) => {
    if (!allThemes().some((t) => t.id === p.theme)) throw new Error(`Unknown theme ${p.theme}`);
    await S.saveSettings({ theme: p.theme });
    return { ok: true };
  },
  notify: (p) => api.invoke('app:notify', { title: p.title, body: p.body }),
  screenshot_capture: () => api.invoke('screenshots:capture'),
  screenshot_list: async (p) => (await api.invoke('screenshots:list')).filter((s) => !p.project || s.project === p.project).slice(0, 100),
  plugin_list: async () => {
    const enabled = S.getState().settings.enabledPlugins || {};
    return (await api.invoke('plugins:installed')).map((m) => ({ id: m.id, name: m.name, version: m.version, enabled: enabled[m.id] !== false, permissions: m.permissions }));
  },
  plugin_set_enabled: async (p) => (await setPluginEnabled(p.id, p.enabled), { ok: true }),
  command_list: () => allCommands().map((c) => ({ id: c.id, title: c.title, category: c.category, keys: c.keys || null })),
  command_execute: async (p) => (await runCommand(p.id), { ok: true }),
  app_state: () => {
    const s = S.getState();
    return {
      workspace: S.activeWorkspace()?.name,
      workspaceId: s.activeWorkspaceId,
      tabId: S.activeTab()?.id,
      paneId: S.activePaneId(),
      cwd: S.activeCwd(),
      sidebar: s.sidebar.open ? s.sidebar.view : null,
      preview: s.preview.open ? s.preview.url : null,
      theme: s.settings.theme,
      devServers: s.devServers,
      panes: S.allPanes().length,
    };
  },
};

export function shellQuote(p) {
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
}

export function installControl() {
  api.on.control(async (id, method, params) => {
    try {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown method ${method}`);
      api.controlRespond(id, await fn(params || {}), null);
    } catch (e) {
      api.controlRespond(id, null, e.message || String(e));
    }
  });
}
