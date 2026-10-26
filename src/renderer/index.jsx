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
  if (st?.workspaces?.length && settings.restoreSessions) {
    S.setState({
      workspaces: st.workspaces,
      activeWorkspaceId: st.activeWorkspaceId,
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
  api.on.menu((id) => runCommand(id));
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
    const id = S.activePaneId();
    if (id) api.setActivePane({ id, cwd: S.paneCwd(id) });
  });
}

init().catch((e) => {
  document.getElementById('root').textContent = `Failed to start: ${e.stack || e}`;
});
