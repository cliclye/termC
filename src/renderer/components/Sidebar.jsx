import { useEffect, useRef, useState } from 'react';
import * as S from '../store';
import * as terminals from '../terminals';
import { shellQuote } from '../control';
import { sendPanelMessage } from '../plugin-host';
import Icon from './Icon';
import GitPanel from './GitPanel';
import { useGitStatus } from './StatusBar';

const api = window.termc;

export default function Sidebar({ shown }) {
  const sidebar = S.useStore((s) => s.sidebar);
  const panels = S.useStore((s) => s.plugin.panels);
  const onResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = sidebar.width;
    const move = (ev) => S.setState((s) => ({ sidebar: { ...s.sidebar, width: Math.min(640, Math.max(220, start + ev.clientX - startX)) } }));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing', 'resizing-row');
    };
    document.body.classList.add('resizing', 'resizing-row');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const view = sidebar.view;
  const plugin = view.startsWith('plugin:') ? panels[view.slice(7)] : null;
  return (
    <aside className={`sidebar ${shown ? 'shown' : ''}`} style={{ width: shown ? sidebar.width : 0 }}>
      <div className="sidebar-inner" style={{ width: sidebar.width }} key={view}>
        {view === 'files' && <FilesPanel />}
        {view === 'git' && <GitPanel />}
        {view === 'run' && <RunPanel />}
        {view === 'sessions' && <SessionsPanel />}
        {plugin && <PluginPanel panel={plugin} />}
        {view.startsWith('plugin:') && !plugin && <Empty text="This plugin panel is no longer available." />}
      </div>
      <div className="sidebar-resize" onMouseDown={onResize} />
    </aside>
  );
}

export function PanelHeader({ title, children, sub }) {
  return (
    <div className="panel-header">
      <div className="panel-title">
        <span>{title}</span>
        {sub && <span className="panel-sub">{sub}</span>}
      </div>
      <div className="panel-actions">{children}</div>
    </div>
  );
}

export const Empty = ({ text, children }) => (
  <div className="empty">
    <p>{text}</p>
    {children}
  </div>
);

function relTo(root, p) {
  return p.startsWith(root + '/') ? p.slice(root.length + 1) : p;
}

// ---------------- Files ----------------
function FilesPanel() {
  const cwd = S.useStore((s) => S.activeCwd(s));
  const revealPath = S.useStore((s) => s.revealPath);
  const [root, setRoot] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState(null);
  const git = useGitStatus(root, [tick]);

  useEffect(() => {
    api.invoke('git:root', cwd).then((r) => setRoot(r || cwd));
  }, [cwd]);

  useEffect(() => {
    if (!revealPath || !root) return;
    const parts = relTo(root, revealPath).split('/');
    const next = {};
    let acc = root;
    for (const p of parts.slice(0, -1)) {
      acc += '/' + p;
      next[acc] = true;
    }
    setExpanded((e) => ({ ...e, ...next }));
    setSelected(revealPath);
    S.setState({ revealPath: null });
  }, [revealPath, root]);

  const statusMap = {};
  if (git?.repo) {
    for (const f of git.files) {
      const abs = git.root + '/' + f.path;
      const kind = f.untracked ? 'new' : f.index === 'D' || f.worktree === 'D' ? 'del' : 'mod';
      statusMap[abs] = kind;
      let d = abs.slice(0, abs.lastIndexOf('/'));
      while (d.length > git.root.length) {
        statusMap[d] = statusMap[d] || 'mod';
        d = d.slice(0, d.lastIndexOf('/'));
      }
    }
  }

  if (!root) return null;
  const name = root.split('/').pop() || '/';
  return (
    <div className="panel">
      <PanelHeader title="Files" sub={name}>
        <button className="icon-btn" title={hidden ? 'Hide dotfiles' : 'Show dotfiles'} onClick={() => setHidden(!hidden)}><Icon name={hidden ? 'eye' : 'eyeOff'} size={14} /></button>
        <button className="icon-btn" title="Insert file path (⌘P)" onClick={() => S.openOverlay({ type: 'filepicker' })}><Icon name="search" size={14} /></button>
        <button className="icon-btn" title="Refresh" onClick={() => setTick(tick + 1)}><Icon name="refresh" size={14} /></button>
      </PanelHeader>
      <div className="panel-body tree" key={tick}>
        <DirChildren dir={root} depth={0} hidden={hidden} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} statusMap={statusMap} />
      </div>
      <div className="panel-hint">Drag files into a terminal · double-click to insert</div>
    </div>
  );
}

function DirChildren({ dir, depth, ...rest }) {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    let alive = true;
    api.invoke('fs:list', dir, rest.hidden).then((r) => alive && setEntries(r.entries));
    return () => {
      alive = false;
    };
  }, [dir, rest.hidden]);
  if (!entries) return null;
  if (!entries.length && depth === 0) return <Empty text="Empty folder" />;
  return (
    <div className={depth ? 'tree-children' : ''}>
      {entries.map((e) => <TreeItem key={e.path} entry={e} depth={depth} {...rest} />)}
    </div>
  );
}

function TreeItem({ entry, depth, expanded, setExpanded, selected, setSelected, statusMap, hidden }) {
  const open = !!expanded[entry.path];
  const status = statusMap[entry.path];
  const insert = () => terminals.paste(S.activePaneId(), shellQuote(entry.path) + ' ');
  const menu = (e) => {
    e.preventDefault();
    setSelected(entry.path);
    S.setState({
      contextMenu: {
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Insert Path in Terminal', run: insert },
          { label: 'Copy Path', run: () => navigator.clipboard.writeText(entry.path) },
          ...(entry.isDir
            ? [
                { label: 'cd Here', run: () => terminals.write(S.activePaneId(), `cd ${shellQuote(entry.path)}\r`) },
                { label: 'Open in New Tab', run: () => S.createTab({ cwd: entry.path }) },
                { label: 'Open in Split', run: () => S.splitPane(null, 'row', { cwd: entry.path }) },
              ]
            : [{ label: 'Open with Default App', run: () => api.invoke('fs:openPath', entry.path) }]),
          { type: 'sep' },
          { label: 'Reveal in Finder', run: () => api.invoke('fs:reveal', entry.path) },
        ],
      },
    });
  };
  return (
    <>
      <div
        className={`tree-item ${selected === entry.path ? 'selected' : ''} ${status ? 'st-' + status : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          setSelected(entry.path);
          if (entry.isDir) setExpanded((x) => ({ ...x, [entry.path]: !open }));
        }}
        onDoubleClick={() => !entry.isDir && insert()}
        onContextMenu={menu}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-termc-path', entry.path);
          e.dataTransfer.setData('text/plain', entry.path);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        title={entry.path}
      >
        {entry.isDir ? <Icon name="chevronRight" size={12} className={`tree-chev ${open ? 'open' : ''}`} /> : <span className="tree-chev" />}
        <Icon name={entry.isDir ? (open ? 'folderOpen' : 'folder') : 'file'} size={14} className={entry.isDir ? 'ic-dir' : 'ic-file'} />
        <span className="tree-name">{entry.name}</span>
        {status && <span className={`tree-status ${status}`}>{status === 'new' ? 'U' : status === 'del' ? 'D' : entry.isDir ? '•' : 'M'}</span>}
      </div>
      {entry.isDir && open && <DirChildren dir={entry.path} depth={depth + 1} hidden={hidden} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} statusMap={statusMap} />}
    </>
  );
}

// ---------------- Run commands ----------------
function RunPanel() {
  const cwd = S.useStore((s) => S.activeCwd(s));
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');
  const load = () => api.invoke('runner:detect', cwd).then(setData);
  useEffect(() => {
    load();
  }, [cwd]);
  const run = (g, item, where) => {
    if (where === 'here') terminals.write(S.activePaneId(), (cwdDiffers(g.dir) ? `cd ${shellQuote(g.dir)} && ` : '') + item.command + '\r');
    else if (where === 'tab') S.createTab({ cwd: g.dir, command: item.command, title: item.name });
    else S.splitPane(null, 'row', { cwd: g.dir, command: item.command });
  };
  const cwdDiffers = (dir) => S.activeCwd() !== dir;
  const groups = (data?.groups || []).map((g) => ({ ...g, items: g.items.filter((i) => !filter || i.name.toLowerCase().includes(filter.toLowerCase())) })).filter((g) => g.items.length);
  return (
    <div className="panel">
      <PanelHeader title="Run" sub={data?.root?.split('/').pop()}>
        <button className="icon-btn" title="Refresh" onClick={load}><Icon name="refresh" size={14} /></button>
      </PanelHeader>
      <div className="panel-search">
        <Icon name="search" size={13} />
        <input placeholder="Filter commands" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="panel-body">
        {data && !groups.length && <Empty text="No scripts, Makefile targets or project commands detected here." />}
        {groups.map((g) => (
          <div key={g.source} className="run-group">
            <div className="section-label">{g.source}</div>
            {g.items.map((item) => (
              <div key={item.name} className="run-item" onClick={(e) => run(g, item, e.altKey ? 'here' : e.metaKey ? 'tab' : 'split')} title={`${item.command}\nClick: run in split · ⌥-click: run here · ⌘-click: new tab`}>
                <Icon name="play" size={11} className="run-play" />
                <div className="run-text">
                  <span className="run-name">{item.name}</span>
                  <span className="run-detail">{item.detail}</span>
                </div>
                <div className="run-actions">
                  <button className="icon-btn" title="Run in current pane" onClick={(e) => { e.stopPropagation(); run(g, item, 'here'); }}><Icon name="terminal" size={13} /></button>
                  <button className="icon-btn" title="Run in new tab" onClick={(e) => { e.stopPropagation(); run(g, item, 'tab'); }}><Icon name="plus" size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="panel-hint">Click runs in a split · ⌥ here · ⌘ new tab</div>
    </div>
  );
}

// ---------------- AI sessions ----------------
function SessionsPanel() {
  const cwd = S.useStore((s) => S.activeCwd(s));
  const offers = S.useStore((s) => s.resumeOffers);
  const [list, setList] = useState(null);
  const load = () => api.invoke('aiSessions:forCwd', cwd).then(setList);
  useEffect(() => {
    load();
  }, [cwd]);
  const fmt = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="panel">
      <PanelHeader title="AI Sessions" sub={cwd.split('/').pop()}>
        <button className="icon-btn" title="Refresh" onClick={load}><Icon name="refresh" size={14} /></button>
      </PanelHeader>
      <div className="panel-body">
        {Object.keys(offers).length > 0 && (
          <>
            <div className="section-label">Interrupted</div>
            {Object.entries(offers).map(([paneId, o]) => (
              <div key={paneId} className="session-item" onClick={() => S.focusPane(paneId)}>
                <span className={`tool-dot ${o.ai.tool}`} />
                <div className="run-text">
                  <span className="run-name">{o.ai.name}</span>
                  <span className="run-detail">{o.command}</span>
                </div>
              </div>
            ))}
          </>
        )}
        <div className="section-label">Recent in this folder</div>
        {list && !list.length && <Empty text="No Claude Code, Codex or Gemini sessions found for this folder." />}
        {list?.map((s) => (
          <div key={s.tool + s.id} className="session-item" title={s.resume}>
            <span className={`tool-dot ${s.tool}`} />
            <div className="run-text">
              <span className="run-name">{s.title || s.name}</span>
              <span className="run-detail">{s.name} · {fmt(s.mtime)}</span>
            </div>
            <div className="run-actions show">
              <button className="btn sm" onClick={() => S.createTab({ cwd, command: s.resume, title: s.name })}>Resume</button>
            </div>
          </div>
        ))}
      </div>
      <div className="panel-hint">TermC watches Claude Code, Codex CLI and Gemini CLI and offers to resume them after a restart.</div>
    </div>
  );
}

// ---------------- Plugin panel ----------------
function PluginPanel({ panel }) {
  const frame = useRef(null);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.source === frame.current?.contentWindow && e.data?.__termc) sendPanelMessage(panel.id, e.data.data);
    };
    const onHost = (e) => {
      if (e.detail.panel === panel.id) frame.current?.contentWindow?.postMessage(e.detail.data, '*');
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('termc-panel-message', onHost);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('termc-panel-message', onHost);
    };
  }, [panel.id]);
  const css = getComputedStyle(document.documentElement);
  const vars = ['bg', 'panel', 'elevated', 'border', 'text', 'muted', 'accent', 'accent-text', 'success', 'warning', 'danger'].map((v) => `--${v}:${css.getPropertyValue('--' + v)};`).join('');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars}}html,body{margin:0;background:var(--panel);color:var(--text);font:13px -apple-system,BlinkMacSystemFont,"Inter",sans-serif}*{box-sizing:border-box}</style>
<script>window.termc={postMessage:(d)=>parent.postMessage({__termc:true,data:d},'*'),onMessage:(fn)=>addEventListener('message',(e)=>e.source===parent&&fn(e.data))};</script></head><body>${panel.html || ''}</body></html>`;
  return (
    <div className="panel">
      <PanelHeader title={panel.title} />
      <iframe ref={frame} className="plugin-frame" sandbox="allow-scripts" srcDoc={doc} title={panel.title} />
    </div>
  );
}
