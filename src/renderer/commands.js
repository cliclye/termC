// Every user action is a command: the palette lists them, shortcuts dispatch them,
// and MCP / plugins can run them by id.
import * as S from './store';
import * as terminals from './terminals';
import { allThemes } from './theme-registry';

const api = window.termc;

async function captureScreenshot() {
  await api.invoke('screenshots:capture');
}

export const COMMANDS = [
  { id: 'palette.open', title: 'Command Palette', category: 'General', keys: 'mod+k', run: () => S.openOverlay({ type: 'palette' }) },
  { id: 'palette.openAlt', title: 'Command Palette', category: 'General', keys: 'mod+shift+p', hidden: true, run: () => S.openOverlay({ type: 'palette' }) },
  { id: 'ai.command', title: 'AI: Generate Shell Command', category: 'AI', keys: 'mod+shift+k', run: () => S.openOverlay({ type: 'palette', ai: true }) },
  { id: 'tab.new', title: 'New Tab', category: 'Tabs', keys: 'mod+t', run: () => S.createTab() },
  { id: 'tab.close', title: 'Close Tab', category: 'Tabs', keys: 'mod+shift+w', run: () => S.closeTabSafely() },
  { id: 'tab.next', title: 'Next Tab', category: 'Tabs', keys: 'mod+shift+]', run: () => S.cycleTab(1) },
  { id: 'tab.prev', title: 'Previous Tab', category: 'Tabs', keys: 'mod+shift+[', run: () => S.cycleTab(-1) },
  { id: 'tab.rename', title: 'Rename Tab…', category: 'Tabs', run: () => S.openOverlay({ type: 'prompt', title: 'Rename tab', value: S.activeTab()?.title || '', onSubmit: (v) => S.renameTab(S.activeTab().id, v) }) },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `tab.goto${i + 1}`, title: `Go to Tab ${i + 1}`, category: 'Tabs', keys: `mod+${i + 1}`, hidden: true,
    run: () => { const ws = S.activeWorkspace(); const t = i === 8 ? ws?.tabs.at(-1) : ws?.tabs[i]; if (t) S.switchTab(t.id); },
  })),
  { id: 'pane.splitRight', title: 'Split Pane Right', category: 'Panes', keys: 'mod+d', run: () => S.splitPane(null, 'row') },
  { id: 'pane.splitDown', title: 'Split Pane Down', category: 'Panes', keys: 'mod+shift+d', run: () => S.splitPane(null, 'column') },
  { id: 'pane.close', title: 'Close Pane', category: 'Panes', keys: 'mod+w', run: () => S.closePaneSafely() },
  { id: 'pane.zoom', title: 'Toggle Pane Zoom', category: 'Panes', keys: 'mod+shift+enter', run: () => S.toggleZoom() },
  { id: 'pane.equalize', title: 'Equalize Pane Sizes', category: 'Panes', keys: 'mod+alt+=', run: () => S.equalizePanes() },
  { id: 'pane.focusLeft', title: 'Focus Pane Left', category: 'Panes', keys: 'mod+alt+arrowleft', run: () => S.focusDirection('left') },
  { id: 'pane.focusRight', title: 'Focus Pane Right', category: 'Panes', keys: 'mod+alt+arrowright', run: () => S.focusDirection('right') },
  { id: 'pane.focusUp', title: 'Focus Pane Up', category: 'Panes', keys: 'mod+alt+arrowup', run: () => S.focusDirection('up') },
  { id: 'pane.focusDown', title: 'Focus Pane Down', category: 'Panes', keys: 'mod+alt+arrowdown', run: () => S.focusDirection('down') },
  { id: 'terminal.clear', title: 'Clear Terminal', category: 'Terminal', keys: 'mod+shift+l', run: () => terminals.clear() },
  { id: 'terminal.find', title: 'Find in Terminal', category: 'Terminal', keys: 'mod+f', run: () => S.setState({ findOpen: S.activePaneId() }) },
  { id: 'terminal.fontUp', title: 'Increase Font Size', category: 'Terminal', keys: 'mod+=', run: () => terminals.adjustFont(1) },
  { id: 'terminal.fontDown', title: 'Decrease Font Size', category: 'Terminal', keys: 'mod+-', run: () => terminals.adjustFont(-1) },
  { id: 'terminal.fontReset', title: 'Reset Font Size', category: 'Terminal', keys: 'mod+0', run: () => terminals.adjustFont(0) },
  { id: 'terminal.insertFile', title: 'Insert File Path (@-mention)…', category: 'Files', keys: 'mod+p', run: () => S.openOverlay({ type: 'filepicker' }) },
  { id: 'workspace.new', title: 'New Workspace…', category: 'Workspaces', keys: 'mod+shift+n', run: () => S.openOverlay({ type: 'workspace' }) },
  { id: 'workspace.openFolder', title: 'Open Folder as Workspace…', category: 'Workspaces', keys: 'mod+o', run: async () => { const dir = await api.invoke('fs:pickDir'); if (dir) S.createWorkspace({ cwd: dir }); } },
  { id: 'workspace.rename', title: 'Rename Workspace…', category: 'Workspaces', run: () => { const w = S.activeWorkspace(); S.openOverlay({ type: 'prompt', title: 'Rename workspace', value: w.name, onSubmit: (v) => v && S.renameWorkspace(w.id, v) }); } },
  { id: 'workspace.close', title: 'Close Workspace', category: 'Workspaces', run: () => S.deleteWorkspace(S.activeWorkspace()?.id) },
  { id: 'workspace.next', title: 'Next Workspace', category: 'Workspaces', keys: 'mod+alt+]', run: () => cycleWorkspace(1) },
  { id: 'workspace.prev', title: 'Previous Workspace', category: 'Workspaces', keys: 'mod+alt+[', run: () => cycleWorkspace(-1) },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `workspace.goto${i + 1}`, title: `Go to Workspace ${i + 1}`, category: 'Workspaces', keys: `mod+alt+${i + 1}`, hidden: true,
    run: () => { const w = S.getState().workspaces[i]; if (w) S.switchWorkspace(w.id); },
  })),
  { id: 'view.files', title: 'Toggle File Browser', category: 'View', keys: 'mod+b', run: () => S.toggleSidebar('files') },
  { id: 'view.git', title: 'Toggle Git Panel', category: 'View', keys: 'mod+g', run: () => S.toggleSidebar('git') },
  { id: 'view.run', title: 'Toggle Run Commands', category: 'View', keys: 'mod+shift+r', run: () => S.toggleSidebar('run') },
  { id: 'view.sessions', title: 'AI Sessions', category: 'AI', keys: 'mod+shift+a', run: () => S.toggleSidebar('sessions') },
  { id: 'view.preview', title: 'Toggle Dev Server Preview', category: 'View', keys: 'mod+shift+b', run: () => (S.getState().preview.open ? S.closePreview() : S.openPreview()) },
  { id: 'view.sidebar', title: 'Toggle Sidebar', category: 'View', keys: 'mod+\\', run: () => S.toggleSidebar() },
  { id: 'screenshot.capture', title: 'Capture Screenshot to Terminal', category: 'AI', keys: 'mod+shift+s', run: captureScreenshot },
  { id: 'settings.open', title: 'Settings', category: 'General', keys: 'mod+,', run: () => S.openOverlay({ type: 'settings' }) },
  { id: 'settings.aliases', title: 'Edit Aliases', category: 'General', run: () => S.openOverlay({ type: 'settings', section: 'aliases' }) },
  { id: 'settings.mcp', title: 'MCP Setup (Claude, Cursor, Windsurf)', category: 'AI', run: () => S.openOverlay({ type: 'settings', section: 'mcp' }) },
  { id: 'settings.screenshots', title: 'Screenshot Manager', category: 'General', run: () => S.openOverlay({ type: 'settings', section: 'screenshots' }) },
  { id: 'plugins.store', title: 'Plugin Store', category: 'Plugins', keys: 'mod+shift+x', run: () => S.openOverlay({ type: 'settings', section: 'store' }) },
  { id: 'git.commit', title: 'Git: Commit…', category: 'Git', run: () => S.showSidebar('git') },
  { id: 'git.worktrees', title: 'Git: Manage Worktrees', category: 'Git', run: () => { S.showSidebar('git'); S.setState({ gitTab: 'worktrees' }); } },
  { id: 'git.graph', title: 'Git: Commit Graph', category: 'Git', run: () => { S.showSidebar('git'); S.setState({ gitTab: 'graph' }); } },
  { id: 'git.branch', title: 'Git: Switch Branch…', category: 'Git', run: () => { S.showSidebar('git'); S.setState({ branchPicker: true }); } },
];

function cycleWorkspace(d) {
  const { workspaces, activeWorkspaceId } = S.getState();
  const i = workspaces.findIndex((w) => w.id === activeWorkspaceId);
  const w = workspaces[(i + d + workspaces.length) % workspaces.length];
  if (w) S.switchWorkspace(w.id);
}

export function themeCommands() {
  return allThemes().map((t) => ({ id: `theme.${t.id}`, title: `Theme: ${t.name}`, category: 'Themes', run: () => S.saveSettings({ theme: t.id }) }));
}

export function pluginCommands() {
  return Object.values(S.getState().plugin.commands);
}

export function allCommands() {
  return [...COMMANDS, ...themeCommands(), ...pluginCommands()];
}

export function runCommand(id, ...args) {
  const c = allCommands().find((x) => x.id === id);
  if (!c) throw new Error(`Unknown command ${id}`);
  return c.run(...args);
}

// ---- keybindings ----
const CODE_KEYS = { BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`' };

export function eventCombo(e) {
  let key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (CODE_KEYS[e.code]) key = CODE_KEYS[e.code];
  else key = e.key.toLowerCase();
  const parts = [];
  if (e.metaKey || (navigator.platform.indexOf('Mac') < 0 && e.ctrlKey)) parts.push('mod');
  if (e.ctrlKey && navigator.platform.indexOf('Mac') >= 0) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

export function normalizeCombo(c) {
  const parts = c.toLowerCase().replace(/cmd|command|meta/g, 'mod').split('+');
  const key = parts.pop();
  const order = ['mod', 'ctrl', 'alt', 'shift'];
  return [...order.filter((m) => parts.includes(m)), key].join('+');
}

export function bindingsMap() {
  const map = new Map();
  for (const c of allCommands()) if (c.keys) map.set(normalizeCombo(c.keys), c.id);
  for (const b of S.getState().plugin.keybindings) map.set(normalizeCombo(b.key), b.command);
  return map;
}

const isMac = navigator.platform.indexOf('Mac') >= 0;
export function prettyKeys(keys) {
  if (!keys) return '';
  const sym = { mod: isMac ? '⌘' : 'Ctrl', ctrl: '⌃', alt: isMac ? '⌥' : 'Alt', shift: '⇧', enter: '↩', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', '\\': '\\' };
  return normalizeCombo(keys)
    .split('+')
    .map((p) => sym[p] || p.toUpperCase())
    .join(isMac ? '' : '+');
}
