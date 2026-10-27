import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import * as S from './store';
import * as terminals from './terminals';
import { applyCurrentTheme } from './theme-registry';
import { bindingsMap, eventCombo, runCommand } from './commands';
import { installControl } from './control';
import { startEnabledPlugins, broadcast } from './plugin-host';
import { shellQuote } from './control';
import App from './components/App';

const api = window.termc;

async function init() {
  const [settings, appInfo, saved] = await Promise.all([api.invoke('settings:get'), api.invoke('app:info'), api.invoke('state:load')]);
  S.setState({ settings, appInfo });
  applyCurrentTheme();
  terminals.setRestoredBuffers(saved.buffers);

  const st = saved.state;
  const restored = settings.restoreSessions ? S.sanitizeWorkspaces(st?.workspaces) : [];
  if (restored.length) {
    S.setState({
      workspaces: restored,
      activeWorkspaceId: restored.some((w) => w.id === st.activeWorkspaceId) ? st.activeWorkspaceId : restored[0].id,
      sidebar: { ...S.getState().sidebar, ...st.sidebar },
      preview: { ...S.getState().preview, ...st.preview, open: false },
    });
    // AI CLI sessions that were still running when TermC last exited were interrupted.
    const offers = {};
    for (const [paneId, ai] of Object.entries(st.ai || {})) {
      if (!S.findPaneAnywhere(paneId)) continue;
      offers[paneId] = { ai, command: await api.invoke('aiSessions:resumeCommand', ai) };
    }
    S.setState({ resumeOffers: offers });
  } else {
    S.createWorkspace({ cwd: appInfo.homeDir, name: 'home' });
  }
  S.setState({ ready: true });

  wireEvents();
  installControl();
  startEnabledPlugins();
  createRoot(document.getElementById('root')).render(<App />);
}

function wireEvents() {
  api.pty.onCwd((id, cwd) => {
    S.setPaneInfo(id, { cwd });
    if (id === S.activePaneId()) api.setActivePane({ id, cwd });
    broadcast('cwdChanged', { paneId: id, cwd });
  });
  api.pty.onCommand((id, info) => {
    const prev = S.getState().paneInfo[id] || {};
    if (info.state === 'running') S.setPaneInfo(id, { running: true, startedAt: Date.now() });
    else {
      S.setPaneInfo(id, { running: false, lastExit: info.exitCode });
      S.setState((s) => ({ fsVersion: (s.fsVersion || 0) + 1 })); // files may have changed
      const took = Date.now() - (prev.startedAt || Date.now());
      if (took > 15000 && !document.hasFocus()) api.invoke('app:notify', { title: info.exitCode ? 'Command failed' : 'Command finished', body: `${prev.cwd || ''} · exit ${info.exitCode} · ${Math.round(took / 1000)}s` });
      broadcast('commandFinished', { paneId: id, exitCode: info.exitCode, durationMs: took });
    }
  });
  api.pty.onProcess((id, info) => S.setPaneInfo(id, { process: info.process, ai: info.ai, fgArgs: info.args }));
  api.pty.onExit((id) => S.setPaneInfo(id, { running: false, ai: null }));

  let known = new Set();
  api.on.devservers((list) => {
    S.setState({ devServers: list });
    for (const s of list) {
      if (known.has(s.key)) continue;
      S.toast(`${s.framework} running on ${s.url}`, { title: 'Dev server detected', actions: [{ label: 'Preview', run: () => S.openPreview(s.url) }] });
    }
    known = new Set(list.map((s) => s.key));
    broadcast('devServers', list);
  });

  api.on.screenshot(({ file }) => {
    const id = S.activePaneId();
    terminals.paste(id, shellQuote(file) + ' ');
    S.toast('Screenshot added to the terminal', { title: 'Screenshot', actions: [{ label: 'Show', run: () => api.invoke('fs:reveal', file) }] });
  });

  api.on.beforeQuit(async () => {
    try {
      await S.saveAll();
    } finally {
      api.invoke('app:quitReady');
    }
  });
  api.on.previewKey((input) => {
    const combo = eventCombo(input);
    if (combo === 'mod+w') return S.closePreview();
    if (combo === 'mod+r') return window.dispatchEvent(new Event('termc-preview-reload'));
    const id = bindingsMap().get(combo);
    if (id && !S.getState().overlay) Promise.resolve(runCommand(id)).catch((err) => S.toast(err.message, { kind: 'error' }));
  });
  api.on.menu((id) => {
    if (id === 'edit.selectAll') return selectAll();
    Promise.resolve(runCommand(id)).catch((err) => S.toast(err.message, { kind: 'error' }));
  });
  setInterval(() => S.saveAll(), 30000);

  // App shortcuts take precedence over the terminal (capture phase).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
      if (e.ctrlKey && !e.metaKey && !e.altKey && navigator.platform.includes('Mac')) return; // ⌃ combos belong to the shell
      const combo = eventCombo(e);
      const id = bindingsMap().get(combo);
      if (!id) return;
      const overlay = S.getState().overlay;
      if (overlay && !['palette.open', 'palette.openAlt', 'settings.open'].includes(id)) return;
      e.preventDefault();
      e.stopPropagation();
      if (overlay && (id === 'palette.open' || id === 'palette.openAlt') && overlay.type === 'palette') return S.closeOverlay();
      Promise.resolve(runCommand(id)).catch((err) => S.toast(err.message, { kind: 'error' }));
    },
    true,
  );

  window.addEventListener('focus', () => {
    S.setState((s) => ({ fsVersion: (s.fsVersion || 0) + 1 }));
    const id = S.activePaneId();
    if (id) api.setActivePane({ id, cwd: S.paneCwd(id) });
  });
}

// ⌘A selects the terminal's scrollback when a terminal has focus, otherwise the text field's contents.
function selectAll() {
  const el = document.activeElement;
  if (el?.closest?.('.xterm')) return terminals.get(S.activePaneId())?.term.selectAll();
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return el.select();
  document.execCommand('selectAll');
}

window.addEventListener('error', (e) => api.log('error', e.message, e.error?.stack || ''));
window.addEventListener('unhandledrejection', (e) => api.log('unhandledrejection', e.reason?.stack || e.reason));

init().catch((e) => {
  document.getElementById('root').textContent = `Failed to start: ${e.stack || e}`;
});
