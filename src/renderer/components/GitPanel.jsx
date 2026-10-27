import { useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../store';
import Icon from './Icon';
import { PanelHeader, Empty } from './Sidebar';

const api = window.termc;

function useAsync(fn, deps) {
  const [v, setV] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((r) => alive && setV(r)).catch(() => alive && setV(null));
    return () => {
      alive = false;
    };
  }, [...deps, n]);
  return [v, () => setN((x) => x + 1)];
}

async function act(fn, ok) {
  try {
    const r = await fn();
    if (ok) S.toast(ok, { kind: 'success' });
    return r;
  } catch (e) {
    S.toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'error', title: 'Git', timeout: 8000 });
    return undefined;
  }
}

export default function GitPanel() {
  const cwd = S.useStore((s) => S.activeCwd(s));
  const tab = S.useStore((s) => s.gitTab || 'changes');
  const [status, reload] = useAsync(() => api.invoke('git:status', cwd), [cwd]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [cwd]);

  if (status && !status.repo)
    return (
      <div className="panel">
        <PanelHeader title="Git" />
        {status.error ? (
          <Empty text={status.error}>
            <button className="btn" onClick={reload}>Try again</button>
          </Empty>
        ) : (
          <Empty text="This folder is not a Git repository.">
            <button className="btn" onClick={async () => { await act(() => api.invoke('git:init', cwd), 'Repository initialized'); reload(); }}>Initialize repository</button>
          </Empty>
        )}
      </div>
    );
  if (!status) return <div className="panel"><PanelHeader title="Git" /></div>;

  const remote = async (op) => {
    setBusy(op);
    await act(() => api.invoke('git:remote', cwd, op), op === 'push' ? 'Pushed' : op === 'pull' ? 'Pulled' : 'Fetched');
    setBusy(null);
    reload();
  };

  return (
    <div className="panel git">
      <PanelHeader title="Git" sub={status.root.split('/').pop()}>
        <button className="icon-btn" title="Fetch" disabled={!!busy} onClick={() => remote('fetch')}><Icon name="refresh" size={14} className={busy === 'fetch' ? 'spin' : ''} /></button>
        <button className="icon-btn" title="Pull" disabled={!!busy} onClick={() => remote('pull')}><Icon name="arrowDown" size={14} />{status.behind > 0 && <span className="mini-count">{status.behind}</span>}</button>
        <button className="icon-btn" title="Push" disabled={!!busy} onClick={() => remote('push')}><Icon name="arrowUp" size={14} />{status.ahead > 0 && <span className="mini-count">{status.ahead}</span>}</button>
      </PanelHeader>
      <BranchSwitcher cwd={cwd} status={status} onChange={reload} />
      <div className="seg sliding" style={{ '--seg-i': ['changes', 'graph', 'worktrees'].indexOf(tab), '--seg-n': 3 }}>
        <span className="seg-indicator" />
        {[
          ['changes', 'Changes', status.files.length],
          ['graph', 'Graph'],
          ['worktrees', 'Worktrees'],
        ].map(([id, label, count]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => S.setState({ gitTab: id })}>
            {label}
            {count > 0 && <span className="seg-count">{count}</span>}
          </button>
        ))}
      </div>
      <div className="tab-pane" key={tab}>
        {tab === 'changes' && <Changes cwd={cwd} status={status} reload={reload} />}
        {tab === 'graph' && <Graph cwd={cwd} />}
        {tab === 'worktrees' && <Worktrees cwd={cwd} />}
      </div>
    </div>
  );
}

function BranchSwitcher({ cwd, status, onChange }) {
  const open = S.useStore((s) => !!s.branchPicker);
  const [q, setQ] = useState('');
  const [branches, reload] = useAsync(() => (open ? api.invoke('git:branches', cwd) : Promise.resolve(null)), [cwd, open]);
  const ref = useRef(null);
  const setOpen = (v) => S.setState({ branchPicker: v });
  useEffect(() => {
    if (!open) return;
    setQ('');
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const list = (branches || []).filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  const checkout = async (name, create) => {
    setOpen(false);
    await act(() => api.invoke('git:checkout', cwd, name, { create }), create ? `Created ${name}` : `Switched to ${name}`);
    onChange();
  };
  return (
    <div className="branch-switcher" ref={ref}>
      <button className="branch-btn" onClick={() => setOpen(!open)}>
        <Icon name="branch" size={13} />
        <span className="branch-name">{status.branch}</span>
        {status.upstream && <span className="branch-up">{status.upstream}</span>}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="popover branch-pop">
          <input
            autoFocus
            placeholder="Switch or create branch…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && q.trim()) {
                const exact = (branches || []).find((b) => b.name === q.trim());
                checkout(q.trim(), !exact);
              }
            }}
          />
          <div className="pop-list">
            {q.trim() && !(branches || []).some((b) => b.name === q.trim()) && (
              <div className="pop-item create" onClick={() => checkout(q.trim(), true)}>
                <Icon name="plus" size={13} /> Create branch <b>{q.trim()}</b>
              </div>
            )}
            {['Local', 'Remote'].map((label) => {
              const items = list.filter((b) => (label === 'Remote') === b.remote);
              if (!items.length) return null;
              return (
                <div key={label}>
                  <div className="section-label">{label}</div>
                  {items.map((b) => (
                    <div key={b.name} className={`pop-item ${b.current ? 'current' : ''}`} onClick={() => !b.current && checkout(b.name)}>
                      {b.current ? <Icon name="check" size={13} /> : <Icon name="branch" size={13} />}
                      <span className="grow">{b.name}</span>
                      <span className="dim">{b.date}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const LETTER = (f) => (f.untracked ? 'U' : f.staged ? f.index : f.worktree);

function Changes({ cwd, status, reload }) {
  const [msg, setMsg] = useState('');
  const [amend, setAmend] = useState(false);
  const staged = status.files.filter((f) => f.staged);
  const unstaged = status.files.filter((f) => f.unstaged || f.untracked);
  const commit = async () => {
    if (!msg.trim()) return S.toast('Write a commit message first', { kind: 'error' });
    const all = staged.length === 0;
    const r = await act(() => api.invoke('git:commit', cwd, msg.trim(), { amend, all }), all ? 'Committed all changes' : 'Committed');
    if (r !== undefined) {
      setMsg('');
      setAmend(false);
    }
    reload();
  };
  return (
    <div className="panel-body">
      <div className="commit-box">
        <textarea
          placeholder={`Message (⌘↩ to commit on ${status.branch})`}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.metaKey && commit()}
          rows={msg.split('\n').length > 2 ? 4 : 2}
        />
        <div className="commit-row">
          <label className="check">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Amend
          </label>
          <button className="btn primary sm" disabled={!status.files.length && !amend} onClick={commit}>
            <Icon name="check" size={13} /> {staged.length ? 'Commit' : 'Commit All'}
          </button>
        </div>
      </div>
      {!status.files.length && <Empty text="Working tree clean" />}
      {staged.length > 0 && (
        <FileGroup title="Staged" files={staged} staged cwd={cwd} reload={reload} groupAction={{ icon: 'minus', title: 'Unstage all', run: () => act(() => api.invoke('git:unstage', cwd)) }} />
      )}
      {unstaged.length > 0 && (
        <FileGroup title="Changes" files={unstaged} cwd={cwd} reload={reload} groupAction={{ icon: 'plus', title: 'Stage all', run: () => act(() => api.invoke('git:stage', cwd)) }} />
      )}
    </div>
  );
}

function FileGroup({ title, files, staged, cwd, reload, groupAction }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="file-group">
      <div className="section-label row">
        <span>{title} <span className="dim">{files.length}</span></span>
        <button className="icon-btn" title={groupAction.title} onClick={async () => { await groupAction.run(); reload(); }}><Icon name={groupAction.icon} size={13} /></button>
      </div>
      {files.map((f) => {
        const key = f.path + (staged ? ':s' : ':u');
        const name = f.path.split('/').pop();
        const dir = f.path.slice(0, -name.length - 1);
        return (
          <div key={key}>
            <div className={`change-item ${open === key ? 'open' : ''}`} onClick={() => setOpen(open === key ? null : key)} title={f.path}>
              <Icon name="chevronRight" size={11} className={`dim chev ${open === key ? 'open' : ''}`} />
              <span className="change-name">{name}</span>
              <span className="change-dir">{dir}</span>
              <span className="change-actions">
                {!staged && (
                  <button
                    className="icon-btn"
                    title={f.untracked ? 'Delete file' : 'Discard changes'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      S.openOverlay({
                        type: 'confirm',
                        title: f.untracked ? `Delete ${name}?` : `Discard changes to ${name}?`,
                        body: f.untracked ? 'This untracked file will be permanently deleted.' : 'Your uncommitted edits to this file will be lost.',
                        danger: true,
                        confirm: f.untracked ? 'Delete' : 'Discard',
                        onSubmit: async () => {
                          await act(() => api.invoke('git:discard', cwd, f.path, f.untracked));
                          reload();
                        },
                      });
                    }}
                  >
                    <Icon name="undo" size={13} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  title={staged ? 'Unstage' : 'Stage'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await act(() => api.invoke(staged ? 'git:unstage' : 'git:stage', cwd, [f.path]));
                    reload();
                  }}
                >
                  <Icon name={staged ? 'minus' : 'plus'} size={13} />
                </button>
              </span>
              <span className={`change-letter l-${LETTER(f)}`}>{LETTER(f)}</span>
            </div>
            {open === key && <InlineDiff cwd={cwd} file={f.path} staged={staged} untracked={f.untracked} />}
          </div>
        );
      })}
    </div>
  );
}

export function DiffView({ text }) {
  if (!text) return <div className="diff empty-diff">No textual changes</div>;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('@@'));
  const body = start >= 0 ? lines.slice(start) : lines;
  if (body.length > 3000) body.length = 3000;
  let oldN = 0;
  let newN = 0;
  return (
    <div className="diff">
      {body.map((l, i) => {
        if (l.startsWith('@@')) {
          const m = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
          if (m) {
            oldN = +m[1];
            newN = +m[2];
          }
          return <div key={i} className="dl hunk">{l}</div>;
        }
        if (l.startsWith('Binary')) return <div key={i} className="dl hunk">{l}</div>;
        if (l.startsWith('\\')) return null;
        const kind = l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx';
        const a = kind === 'add' ? '' : oldN++;
        const b = kind === 'del' ? '' : newN++;
        return (
          <div key={i} className={`dl ${kind}`}>
            <span className="ln">{a}</span>
            <span className="ln">{b}</span>
            <span className="code">{l.slice(1) || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

function InlineDiff({ cwd, file, staged, untracked }) {
  const [text] = useAsync(() => api.invoke('git:diff', cwd, file, staged, untracked), [cwd, file, staged]);
  if (text === null) return <div className="diff loading">Loading…</div>;
  return <DiffView text={text} />;
}

// ---- commit graph ----
const LANE_COLORS = ['#7c9cff', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#2dd4bf'];
const ROW = 26;
const COL = 12;

function layoutGraph(commits) {
  const lanes = [];
  const rows = [];
  for (const c of commits) {
    let col = lanes.indexOf(c.hash);
    if (col < 0) {
      col = lanes.indexOf(null);
      if (col < 0) col = lanes.length;
      lanes[col] = c.hash;
    }
    const before = lanes.slice();
    for (let i = 0; i < lanes.length; i++) if (i !== col && lanes[i] === c.hash) lanes[i] = null;
    const fresh = new Set();
    lanes[col] = c.parents[0] || null;
    for (const p of c.parents.slice(1)) {
      if (lanes.includes(p)) continue;
      let k = lanes.indexOf(null);
      if (k < 0) k = lanes.length;
      lanes[k] = p;
      fresh.add(k);
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ c, col, before, after: lanes.slice(), fresh });
  }
  // Edges between row i and i+1.
  const edges = [];
  let width = 1;
  rows.forEach((r, i) => {
    width = Math.max(width, r.before.length, r.after.length);
    const next = rows[i + 1];
    r.after.forEach((h, j) => {
      if (!h) return;
      const from = r.fresh.has(j) || j === r.col ? r.col : j;
      const to = next ? (h === next.c.hash ? next.col : j) : j;
      edges.push({ i, from, to, color: LANE_COLORS[j % LANE_COLORS.length], last: !next });
    });
    // Parent already had a lane elsewhere: connect this node into it.
    r.c.parents.slice(1).forEach((p) => {
      const j = r.after.indexOf(p);
      if (j >= 0 && !r.fresh.has(j) && j !== r.col) edges.push({ i, from: r.col, to: next && p === next.c.hash ? next.col : j, color: LANE_COLORS[j % LANE_COLORS.length], last: !next, merge: true });
    });
  });
  return { rows, edges, width };
}

function Graph({ cwd }) {
  const [commits] = useAsync(() => api.invoke('git:log', cwd, 300), [cwd]);
  const [sel, setSel] = useState(null);
  const g = useMemo(() => (commits ? layoutGraph(commits) : null), [commits]);
  if (!g) return <div className="panel-body" />;
  if (!g.rows.length) return <Empty text="No commits yet" />;
  const w = Math.min(g.width, 8) * COL + 12;
  const x = (c) => 8 + Math.min(c, 7.5) * COL;
  return (
    <div className="panel-body graph">
      <div className="graph-wrap" style={{ height: g.rows.length * ROW }}>
        <svg className="graph-svg" width={w} height={g.rows.length * ROW}>
          {g.edges.map((e, k) => {
            const y1 = e.i * ROW + ROW / 2;
            const y2 = y1 + ROW;
            const x1 = x(e.from);
            const x2 = x(e.to);
            const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${y1 + ROW * 0.6} ${x2} ${y2 - ROW * 0.6} ${x2} ${y2}`;
            return <path key={k} d={d} stroke={e.color} strokeWidth="1.6" fill="none" opacity={e.last ? 0.4 : 1} />;
          })}
          {g.rows.map((r, i) => (
            <circle key={r.c.hash} cx={x(r.col)} cy={i * ROW + ROW / 2} r={r.c.parents.length > 1 ? 3 : 4} fill={r.c.parents.length > 1 ? 'var(--panel)' : LANE_COLORS[r.col % LANE_COLORS.length]} stroke={LANE_COLORS[r.col % LANE_COLORS.length]} strokeWidth="2" />
          ))}
        </svg>
        <div className="graph-rows" style={{ marginLeft: w }}>
          {g.rows.map((r) => (
            <div key={r.c.hash} className={`graph-row ${sel === r.c.hash ? 'selected' : ''}`} style={{ height: ROW }} onClick={() => setSel(sel === r.c.hash ? null : r.c.hash)} title={`${r.c.hash.slice(0, 10)} · ${r.c.author} · ${r.c.date}`}>
              {r.c.refs.map((ref) => (
                <span key={ref} className={`ref ${ref.startsWith('HEAD') ? 'head' : ref.startsWith('tag:') ? 'tag' : ref.includes('/') ? 'remote' : ''}`}>{ref.replace('HEAD -> ', '⏺ ').replace('tag: ', '')}</span>
              ))}
              <span className="graph-subject">{r.c.subject}</span>
            </div>
          ))}
        </div>
      </div>
      {sel && <CommitDetail cwd={cwd} hash={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function CommitDetail({ cwd, hash, onClose }) {
  const [text] = useAsync(() => api.invoke('git:show', cwd, hash), [hash]);
  const header = text ? text.split('\ndiff --git')[0] : '';
  const diff = text ? text.slice(header.length) : '';
  return (
    <div className="commit-detail">
      <div className="commit-detail-head">
        <code>{hash.slice(0, 10)}</code>
        <button className="icon-btn" onClick={() => navigator.clipboard.writeText(hash)} title="Copy hash"><Icon name="copy" size={13} /></button>
        <span className="grow" />
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={13} /></button>
      </div>
      <pre className="commit-meta">{header.trim()}</pre>
      {diff && <DiffView text={diff} />}
    </div>
  );
}

// ---- worktrees ----
function Worktrees({ cwd }) {
  const [list, reload] = useAsync(() => api.invoke('git:worktrees', cwd), [cwd]);
  const [branch, setBranch] = useState('');
  const add = async () => {
    if (!branch.trim()) return;
    const path = await act(() => api.invoke('git:worktreeAdd', cwd, { branch: branch.trim() }), `Worktree created for ${branch.trim()}`);
    if (path) {
      setBranch('');
      S.createTab({ cwd: path, title: branch.trim() });
    }
    reload();
  };
  return (
    <div className="panel-body">
      <div className="wt-add">
        <input placeholder="Branch for new worktree" value={branch} onChange={(e) => setBranch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" onClick={add} disabled={!branch.trim()}><Icon name="plus" size={13} /> Add</button>
      </div>
      <div className="panel-note">Each worktree is a separate checkout in a sibling folder, so you can run agents on several branches in parallel.</div>
      {list?.map((w) => (
        <div key={w.path} className="wt-item">
          <Icon name="layers" size={14} className="dim" />
          <div className="run-text">
            <span className="run-name">{w.branch || w.head}{w.main && <span className="pill">main</span>}</span>
            <span className="run-detail" title={w.path}>{w.path}</span>
          </div>
          <div className="run-actions show">
            <button className="icon-btn" title="Open in new tab" onClick={() => S.createTab({ cwd: w.path, title: w.branch })}><Icon name="terminal" size={13} /></button>
            <button className="icon-btn" title="Open in split" onClick={() => S.splitPane(null, 'row', { cwd: w.path })}><Icon name="splitH" size={13} /></button>
            {!w.main && (
              <button
                className="icon-btn danger"
                title="Remove worktree"
                onClick={() =>
                  S.openOverlay({
                    type: 'confirm',
                    title: `Remove worktree ${w.branch}?`,
                    body: `The folder ${w.path} will be deleted. The branch itself is kept.`,
                    danger: true,
                    confirm: 'Remove',
                    extra: { label: 'Force (discard uncommitted changes)' },
                    onSubmit: async (force) => {
                      await act(() => api.invoke('git:worktreeRemove', cwd, w.path, !!force), 'Worktree removed');
                      reload();
                    },
                  })
                }
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
