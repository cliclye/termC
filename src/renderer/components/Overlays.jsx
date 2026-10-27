import { useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../store';
import * as terminals from '../terminals';
import { allCommands, prettyKeys } from '../commands';
import { fuzzyFilter } from '../fuzzy';
import { shellQuote } from '../control';
import { tabLabel } from './TabBar';
import Icon from './Icon';
import Settings from './Settings';
import { usePresence, useLatest } from '../motion';

const api = window.termc;

export default function Overlays() {
  const live = S.useStore((s) => s.overlay);
  const overlay = useLatest(live);
  const [mounted, shown] = usePresence(!!live, 160);
  if (!mounted || !overlay) return null;
  const close = () => {
    if (!live) return;
    overlay.onCancel?.();
    S.closeOverlay();
  };
  const body = {
    palette: <Palette overlay={overlay} close={close} />,
    filepicker: <FilePicker close={close} />,
    settings: <Settings overlay={overlay} close={close} />,
    prompt: <Prompt overlay={overlay} close={close} />,
    pick: <Pick overlay={overlay} close={close} />,
    confirm: <Confirm overlay={overlay} close={close} />,
    workspace: <NewWorkspace close={close} />,
  }[overlay.type];
  return (
    <div className={`overlay ${overlay.type === 'settings' ? 'center' : ''} ${shown ? 'shown' : ''}`} style={{ pointerEvents: live ? undefined : 'none' }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {body}
    </div>
  );
}

function Highlight({ text, positions }) {
  if (!positions?.length) return text;
  const set = new Set(positions);
  return [...text].map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : ch));
}

function useListNav(count, onEnter) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [count]);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setI((x) => Math.min(count - 1, x + 1));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setI((x) => Math.max(0, x - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEnter(i, e);
    }
  };
  return [i, setI, onKeyDown];
}

// ---------------- Command palette + AI ----------------
function Palette({ overlay, close }) {
  const [q, setQ] = useState(overlay.query || '');
  const [ai, setAi] = useState(overlay.ai ? { state: 'idle' } : null);
  const listRef = useRef(null);

  const entries = useMemo(() => {
    const s = S.getState();
    const cmds = allCommands().filter((c) => !c.hidden).map((c) => ({ ...c, kind: 'command' }));
    const tabs = s.workspaces.flatMap((w) =>
      w.tabs.map((t) => ({ id: 'goto:' + t.id, title: `${w.name} › ${tabLabel(t, s.paneInfo, s.appInfo.homeDir)}`, category: 'Go to tab', kind: 'tab', run: () => S.switchTab(t.id) })),
    );
    const wss = s.workspaces.map((w) => ({ id: 'ws:' + w.id, title: `Workspace: ${w.name}`, category: 'Workspaces', kind: 'ws', run: () => S.switchWorkspace(w.id) }));
    return [...cmds, ...wss, ...tabs];
  }, []);

  // Match the title first so highlight positions line up with it; the category still counts for matching.
  const results = useMemo(() => fuzzyFilter(entries, q, (e) => `${e.title}  ${e.category}`).slice(0, 60), [q, entries]);
  const aiItem = q.trim() ? [{ item: { id: 'ai', kind: 'ai', title: q.trim() } }] : [];
  // When nothing matches well, asking the AI becomes the default action.
  const list = results.length && results[0].score > q.length * 2 ? [...results, ...aiItem] : [...aiItem, ...results];

  const runEntry = (entry) => {
    if (!entry) return;
    if (entry.kind === 'ai') return ask(entry.title);
    close();
    Promise.resolve(entry.run()).catch((e) => S.toast(e.message, { kind: 'error' }));
  };
  const [sel, setSel, onKeyDown] = useListNav(list.length, (i) => runEntry(list[i]?.item));

  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  async function ask(query) {
    setAi({ state: 'loading', query });
    try {
      const paneId = S.activePaneId();
      const r = await api.invoke('ai:generate', { query, cwd: S.activeCwd(), shell: S.getState().settings.shell });
      setAi({ state: 'done', query, paneId, ...r });
    } catch (e) {
      setAi({ state: 'error', query, error: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    }
  }

  if (ai) return <AiResult ai={ai} setAi={setAi} ask={ask} close={close} initialQuery={q} />;

  return (
    <div className="palette">
      <div className="palette-input">
        <Icon name="search" size={16} />
        <input
          autoFocus
          value={q}
          placeholder="Search commands, tabs, workspaces — or describe a shell command"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return close();
            if (e.key === 'Tab' && q.trim()) {
              e.preventDefault();
              return ask(q.trim());
            }
            onKeyDown(e);
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="palette-list" ref={listRef}>
        {list.map(({ item, positions }, i) =>
          item.kind === 'ai' ? (
            <div key="ai" className={`palette-item ai ${i === sel ? 'active' : ''}`} onMouseMove={() => setSel(i)} onClick={() => runEntry(item)}>
              <Icon name="sparkles" size={15} className="ai-icon" />
              <span className="palette-title">
                Generate command: <b>{item.title}</b>
              </span>
              <kbd>tab</kbd>
            </div>
          ) : (
            <div key={item.id} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseMove={() => setSel(i)} onClick={() => runEntry(item)}>
              <span className="palette-cat">{item.category}</span>
              <span className="palette-title">
                <Highlight text={item.title} positions={positions?.filter((p) => p < item.title.length)} />
              </span>
              {item.keys && <kbd>{prettyKeys(item.keys)}</kbd>}
            </div>
          ),
        )}
        {!list.length && <div className="palette-empty">Type to search, or describe what you want to do in plain English.</div>}
      </div>
      <div className="palette-foot">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↩</kbd> run</span>
        <span><kbd>tab</kbd> ask AI</span>
      </div>
    </div>
  );
}

function AiResult({ ai, setAi, ask, close }) {
  const [cmd, setCmd] = useState(ai.command || '');
  const [q, setQ] = useState(ai.query || '');
  const inputRef = useRef(null);
  useEffect(() => {
    setCmd(ai.command || '');
    if (ai.state === 'done') requestAnimationFrame(() => inputRef.current?.focus());
  }, [ai.command, ai.state]);
  const paneId = ai.paneId || S.activePaneId();
  const send = (execute) => {
    if (!cmd.trim()) return;
    close();
    S.runCommandIn(paneId, cmd, { execute });
  };
  return (
    <div className="palette ai-panel">
      <div className="palette-input">
        <Icon name="sparkles" size={16} className="ai-icon" />
        <input
          autoFocus={ai.state !== 'done'}
          value={q}
          placeholder="Describe a command, e.g. find TypeScript files changed this week"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter' && q.trim()) ask(q.trim());
          }}
        />
        <kbd>↩</kbd>
      </div>
      <div className="ai-body">
        {ai.state === 'idle' && <div className="ai-hint">AI Command — describe what you need. Uses your current folder, shell and git branch as context.</div>}
        {ai.state === 'loading' && (
          <div className="ai-loading">
            <span className="dots"><i /><i /><i /></span> Generating…
          </div>
        )}
        {ai.state === 'error' && (
          <div className="ai-error">
            <Icon name="x" size={14} /> {ai.error}
            <button className="btn sm" onClick={() => { close(); S.openOverlay({ type: 'settings', section: 'ai' }); }}>AI settings</button>
          </div>
        )}
        {ai.state === 'done' && (
          <>
            <div className="ai-label">Generated <span className="dim">via {ai.provider}</span></div>
            <div className="ai-cmd">
              <span className="prompt">$</span>
              <textarea
                ref={inputRef}
                value={cmd}
                spellCheck={false}
                rows={Math.min(6, Math.max(1, Math.ceil(cmd.length / 72)))}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(!e.metaKey);
                  }
                }}
              />
            </div>
            {ai.explanation && <div className="ai-expl">{ai.explanation}</div>}
            <div className="ai-actions">
              <button className="btn primary" onClick={() => send(true)}><Icon name="play" size={12} /> Run <kbd>↩</kbd></button>
              <button className="btn" onClick={() => send(false)}>Insert <kbd>⌘↩</kbd></button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(cmd); S.toast('Copied', { kind: 'success' }); }}><Icon name="copy" size={12} /> Copy</button>
              <span className="grow" />
              <button className="btn ghost" onClick={() => setAi(null)}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- @-mention file picker ----------------
function FilePicker({ close }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const paneId = S.activePaneId();
  const cwd = S.activeCwd();
  useEffect(() => {
    api.invoke('fs:projectFiles', cwd).then(setData);
  }, [cwd]);
  const results = useMemo(() => (data ? fuzzyFilter(data.files, q, (f) => f).slice(0, 80) : []), [data, q]);
  const insert = (rel, abs) => {
    close();
    const full = data.root + '/' + rel;
    const info = S.getState().paneInfo[paneId] || {};
    let text;
    if (abs) text = shellQuote(full);
    else {
      const fromCwd = full.startsWith(cwd + '/') ? full.slice(cwd.length + 1) : full;
      // AI CLIs understand @path mentions; shells get a quoted path.
      text = info.ai ? '@' + fromCwd : shellQuote(fromCwd);
    }
    terminals.paste(paneId, text + ' ');
  };
  const [sel, setSel, onKeyDown] = useListNav(results.length, (i, e) => results[i] && insert(results[i].item, e.metaKey));
  return (
    <div className="palette">
      <div className="palette-input">
        <span className="at">@</span>
        <input autoFocus value={q} placeholder="Find a file to mention in the terminal" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => (e.key === 'Escape' ? close() : onKeyDown(e))} />
        <kbd>esc</kbd>
      </div>
      <div className="palette-list">
        {!data && <div className="palette-empty">Indexing files…</div>}
        {results.map(({ item, positions }, i) => {
          const slash = item.lastIndexOf('/');
          return (
            <div key={item} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseMove={() => setSel(i)} onClick={(e) => insert(item, e.metaKey)}>
              <Icon name="file" size={14} className="dim" />
              <span className="palette-title">
                <Highlight text={item.slice(slash + 1)} positions={positions?.map((p) => p - slash - 1).filter((p) => p >= 0)} />
              </span>
              <span className="palette-path">{item.slice(0, Math.max(0, slash))}</span>
            </div>
          );
        })}
      </div>
      <div className="palette-foot">
        <span><kbd>↩</kbd> insert relative</span>
        <span><kbd>⌘↩</kbd> insert absolute</span>
        <span className="dim">{data ? `${data.files.length} files` : ''}</span>
      </div>
    </div>
  );
}

// ---------------- Small dialogs ----------------
function Prompt({ overlay, close }) {
  const [v, setV] = useState(overlay.value || '');
  const submit = () => {
    S.setState({ overlay: null });
    overlay.onSubmit?.(v);
  };
  return (
    <div className="dialog">
      <div className="dialog-title">{overlay.title}</div>
      <input autoFocus value={v} placeholder={overlay.placeholder} onFocus={(e) => e.target.select()} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }} />
      <div className="dialog-actions">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={submit}>OK</button>
      </div>
    </div>
  );
}

function Pick({ overlay, close }) {
  const [q, setQ] = useState('');
  const items = overlay.items.map((x) => (typeof x === 'string' ? { label: x, value: x } : x));
  const results = fuzzyFilter(items, q, (x) => x.label);
  const choose = (x) => {
    S.setState({ overlay: null });
    overlay.onSubmit?.(x.value);
  };
  const [sel, setSel, onKeyDown] = useListNav(results.length, (i) => results[i] && choose(results[i].item));
  return (
    <div className="palette">
      <div className="palette-input">
        <Icon name="search" size={16} />
        <input autoFocus value={q} placeholder={overlay.title} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => (e.key === 'Escape' ? close() : onKeyDown(e))} />
      </div>
      <div className="palette-list">
        {results.map(({ item, positions }, i) => (
          <div key={item.value + i} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseMove={() => setSel(i)} onClick={() => choose(item)}>
            <span className="palette-title"><Highlight text={item.label} positions={positions} /></span>
            {item.detail && <span className="palette-path">{item.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Confirm({ overlay, close }) {
  const [extra, setExtra] = useState(false);
  const ok = () => {
    S.setState({ overlay: null });
    overlay.onSubmit?.(extra);
  };
  return (
    <div className="dialog" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="dialog-title">{overlay.title}</div>
      {overlay.body && <p className="dialog-body">{overlay.body}</p>}
      {overlay.extra && (
        <label className="check">
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> {overlay.extra.label}
        </label>
      )}
      <div className="dialog-actions">
        <button className="btn ghost" autoFocus onClick={close}>Cancel</button>
        <button className={`btn ${overlay.danger ? 'danger' : 'primary'}`} onClick={ok}>{overlay.confirm || 'OK'}</button>
      </div>
    </div>
  );
}

function NewWorkspace({ close }) {
  const [dir, setDir] = useState(S.activeCwd());
  const [name, setName] = useState('');
  const [color, setColor] = useState(S.WORKSPACE_COLORS[S.getState().workspaces.length % S.WORKSPACE_COLORS.length]);
  const [error, setError] = useState('');
  const create = async () => {
    const home = S.getState().appInfo.homeDir;
    const path = dir.trim().replace(/^~(?=\/|$)/, home).replace(/\/+$/, '') || '/';
    const r = await api.invoke('fs:list', path).catch((e) => ({ error: e.message }));
    if (r.error) return setError(`Can't open that folder: ${r.error.replace(/^\w+: /, '')}`);
    S.setState({ overlay: null });
    S.createWorkspace({ name: name.trim() || undefined, cwd: path, color });
  };
  return (
    <div className="dialog wide">
      <div className="dialog-title">New workspace</div>
      <label className="field">
        <span>Project folder</span>
        <div className="row-input">
          <input value={dir} onChange={(e) => { setDir(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && create()} spellCheck={false} />
          <button className="btn" onClick={async () => { const d = await api.invoke('fs:pickDir'); if (d) setDir(d); }}>Browse…</button>
        </div>
      </label>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={name} placeholder={dir.split('/').filter(Boolean).pop()} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') close(); }} />
      </label>
      {error && <div className="danger-text">{error}</div>}
      <div className="field">
        <span>Color</span>
        <div className="swatches">
          {S.WORKSPACE_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={create}>Create</button>
      </div>
    </div>
  );
}
