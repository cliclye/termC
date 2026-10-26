import { useEffect, useRef, useState } from 'react';
import * as S from '../store';
import * as terminals from '../terminals';
import { panesOf } from '../layout';
import { shellQuote } from '../control';
import { sendContextMenu } from '../plugin-host';
import Icon from './Icon';

const api = window.termc;

export default function Workspace({ workspace, visible }) {
  return (
    <div className="workspace" style={{ display: visible ? 'flex' : 'none' }}>
      {workspace.tabs.map((t) => (
        <TabView key={t.id} tab={t} visible={visible && t.id === workspace.activeTabId} />
      ))}
    </div>
  );
}

function TabView({ tab, visible }) {
  const multi = tab.root.type === 'split';
  return (
    <div className="tab-view" style={{ display: visible ? 'flex' : 'none' }}>
      {tab.zoomed && panesOf(tab.root).some((p) => p.id === tab.zoomed) ? (
        <TerminalPane pane={panesOf(tab.root).find((p) => p.id === tab.zoomed)} active visible={visible} multi={false} zoomed />
      ) : (
        <Node node={tab.root} tab={tab} visible={visible} multi={multi} />
      )}
    </div>
  );
}

function Node({ node, tab, visible, multi }) {
  if (node.type === 'pane') return <TerminalPane pane={node} active={tab.activePaneId === node.id} visible={visible} multi={multi} />;
  return (
    <div className={`split split-${node.dir}`}>
      <div className="split-child" style={{ flexGrow: node.ratio, flexBasis: 0 }}>
        <Node node={node.a} tab={tab} visible={visible} multi={multi} />
      </div>
      <Divider split={node} />
      <div className="split-child" style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}>
        <Node node={node.b} tab={tab} visible={visible} multi={multi} />
      </div>
    </div>
  );
}

function Divider({ split }) {
  const onMouseDown = (e) => {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    const rect = container.getBoundingClientRect();
    const move = (ev) => {
      const r = split.dir === 'row' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      S.resizeSplit(split.id, r);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing', 'resizing-row', 'resizing-column');
    };
    document.body.classList.add('resizing', `resizing-${split.dir}`);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return <div className={`divider divider-${split.dir}`} onMouseDown={onMouseDown} onDoubleClick={() => S.resizeSplit(split.id, 0.5)} />;
}

function edgeFor(e, el) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
}

function TerminalPane({ pane, active, visible, multi, zoomed }) {
  const ref = useRef(null);
  // Only panes created just now animate in (existing ones remount when the split tree changes).
  const isNew = useRef(!terminals.has(pane.id)).current;
  const [drop, setDrop] = useState(null);
  const info = S.useStore((s) => s.paneInfo[pane.id]);
  const offer = S.useStore((s) => s.resumeOffers[pane.id]);
  const findOpen = S.useStore((s) => s.findOpen === pane.id);

  useEffect(() => {
    terminals.ensure(pane.id, { cwd: pane.cwd, command: pane.command });
    terminals.attach(pane.id, ref.current);
    const ro = new ResizeObserver(() => terminals.fitSoon(pane.id));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [pane.id]);

  useEffect(() => {
    if (visible && active) {
      terminals.fitSoon(pane.id);
      requestAnimationFrame(() => {
        if (!S.getState().overlay) terminals.focus(pane.id);
      });
      api.setActivePane({ id: pane.id, cwd: S.paneCwd(pane.id) });
    }
  }, [visible, active, pane.id]);

  const onDragOver = (e) => {
    const types = e.dataTransfer.types;
    if (types.includes('application/x-termc-pane')) {
      e.preventDefault();
      setDrop({ kind: 'pane', edge: edgeFor(e, e.currentTarget) });
    } else if (types.includes('application/x-termc-path') || types.includes('Files')) {
      e.preventDefault();
      setDrop({ kind: 'file' });
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    const d = drop;
    setDrop(null);
    const src = e.dataTransfer.getData('application/x-termc-pane');
    if (src) return S.movePane(src, pane.id, d?.edge || 'right');
    const internal = e.dataTransfer.getData('application/x-termc-path');
    const paths = internal ? [internal] : [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) terminals.paste(pane.id, paths.map(shellQuote).join(' ') + ' ');
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    S.focusPane(pane.id);
    const rec = terminals.get(pane.id);
    const selection = rec?.term.getSelection() || '';
    const pluginItems = Object.entries(S.getState().plugin.contextMenu).map(([key, item]) => ({ label: item.label, run: () => sendContextMenu(key, { paneId: pane.id, selection, cwd: S.paneCwd(pane.id) }) }));
    S.setState({
      contextMenu: {
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Copy', keys: '⌘C', disabled: !selection, run: () => navigator.clipboard.writeText(selection) },
          { label: 'Paste', keys: '⌘V', run: async () => terminals.paste(pane.id, await navigator.clipboard.readText()) },
          { label: 'Select All', run: () => rec?.term.selectAll() },
          { type: 'sep' },
          { label: 'Split Right', keys: '⌘D', run: () => S.splitPane(pane.id, 'row') },
          { label: 'Split Down', keys: '⇧⌘D', run: () => S.splitPane(pane.id, 'column') },
          { label: zoomed ? 'Restore Pane' : 'Zoom Pane', keys: '⇧⌘↩', run: () => S.toggleZoom(pane.id) },
          { type: 'sep' },
          { label: 'Clear', keys: '⇧⌘L', run: () => terminals.clear(pane.id) },
          { label: 'Find…', keys: '⌘F', run: () => S.setState({ findOpen: pane.id }) },
          ...(pluginItems.length ? [{ type: 'sep' }, ...pluginItems] : []),
          { type: 'sep' },
          { label: 'Close Pane', keys: '⌘W', run: () => S.closePane(pane.id) },
        ],
      },
    });
  };

  return (
    <div
      className={`pane ${active ? 'active' : ''} ${multi ? 'multi' : ''} ${isNew ? 'pane-enter' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDrop(null)}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      onMouseDown={() => !active && S.focusPane(pane.id)}
    >
      <div className="pane-term" ref={ref} />
      {(multi || zoomed) && (
        <div className="pane-tools">
          <span className="pane-grip" draggable onDragStart={(e) => {
            e.dataTransfer.setData('application/x-termc-pane', pane.id);
            e.dataTransfer.effectAllowed = 'move';
          }} title="Drag to move pane">
            <Icon name="more" size={14} />
          </span>
          <button title="Split right (⌘D)" onClick={() => S.splitPane(pane.id, 'row')}><Icon name="splitH" size={13} /></button>
          <button title="Split down (⇧⌘D)" onClick={() => S.splitPane(pane.id, 'column')}><Icon name="splitV" size={13} /></button>
          <button title="Zoom (⇧⌘↩)" onClick={() => S.toggleZoom(pane.id)}><Icon name="maximize" size={13} /></button>
          <button title="Close (⌘W)" onClick={() => S.closePane(pane.id)}><Icon name="x" size={13} /></button>
        </div>
      )}
      {zoomed && <div className="zoom-badge">Zoomed · ⇧⌘↩ to restore</div>}
      {findOpen && <FindBar paneId={pane.id} />}
      {offer && <ResumeBanner paneId={pane.id} offer={offer} />}
      {drop?.kind === 'pane' && <div className={`drop-zone drop-${drop.edge}`} />}
      {drop?.kind === 'file' && <div className="drop-zone drop-file"><span>Drop to insert path</span></div>}
      {info?.ai && multi && <div className="pane-ai-badge"><Icon name="sparkles" size={11} /> {info.ai.name}</div>}
    </div>
  );
}

function FindBar({ paneId }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);
  const rec = terminals.get(paneId);
  const opts = { decorations: { matchOverviewRuler: '#e5c07b', activeMatchColorOverviewRuler: '#7c9cff', matchBackground: '#e5c07b55', activeMatchBackground: '#7c9cff88' } };
  const close = () => {
    rec?.search.clearDecorations();
    S.setState({ findOpen: null });
    terminals.focus(paneId);
  };
  return (
    <div className="find-bar" onMouseDown={(e) => e.stopPropagation()}>
      <Icon name="search" size={13} />
      <input
        ref={inputRef}
        value={q}
        placeholder="Find"
        onChange={(e) => {
          setQ(e.target.value);
          rec?.search.findNext(e.target.value, { ...opts, incremental: true });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.shiftKey ? rec?.search.findPrevious(q, opts) : rec?.search.findNext(q, opts);
          if (e.key === 'Escape') close();
        }}
      />
      <button onClick={() => rec?.search.findPrevious(q, opts)}><Icon name="arrowUp" size={13} /></button>
      <button onClick={() => rec?.search.findNext(q, opts)}><Icon name="arrowDown" size={13} /></button>
      <button onClick={close}><Icon name="x" size={13} /></button>
    </div>
  );
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function ResumeBanner({ paneId, offer }) {
  const dismiss = () =>
    S.setState((s) => {
      const { [paneId]: _, ...rest } = s.resumeOffers;
      return { resumeOffers: rest };
    });
  return (
    <div className="resume-banner" onMouseDown={(e) => e.stopPropagation()}>
      <div className="resume-icon"><Icon name="history" size={15} /></div>
      <div className="resume-text">
        <strong>Session detected</strong>
        <span>{offer.ai.name} session from {ago(offer.ai.startedAt)} was interrupted</span>
      </div>
      <button className="btn primary sm" onClick={() => { terminals.write(paneId, offer.command + '\r'); dismiss(); terminals.focus(paneId); }}>Resume</button>
      <button className="btn ghost sm" onClick={dismiss}>Dismiss</button>
    </div>
  );
}
