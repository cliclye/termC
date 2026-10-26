import { useState } from 'react';
import * as S from '../store';
import { panesOf } from '../layout';
import Icon from './Icon';

const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'login', '-zsh', '-bash']);
const base = (p) => (p ? p.replace(/\/+$/, '').split('/').pop() || '/' : '');

export function tabLabel(tab, paneInfo, home) {
  if (tab.title) return tab.title;
  const info = paneInfo[tab.activePaneId] || {};
  if (info.ai) return info.ai.name;
  const cwd = info.cwd || panesOf(tab.root)[0]?.cwd;
  const dir = cwd === home ? '~' : base(cwd);
  if (info.process && !SHELLS.has(info.process)) return `${info.process} · ${dir}`;
  return dir || 'terminal';
}

export default function TabBar() {
  const ws = S.useStore((s) => S.activeWorkspace(s));
  const paneInfo = S.useStore((s) => s.paneInfo);
  const home = S.useStore((s) => s.appInfo?.homeDir);
  const [editing, setEditing] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  if (!ws) return <div className="tabbar" />;

  return (
    <div className="tabbar">
      <div className="ws-label" style={{ '--ws': ws.color }}>
        <span className="ws-dot" />
        {ws.name}
      </div>
      <div className="tabs" onDoubleClick={(e) => e.target === e.currentTarget && S.createTab()}>
        {ws.tabs.map((t, i) => {
          const panes = panesOf(t.root);
          const busy = panes.some((p) => paneInfo[p.id]?.running);
          const ai = panes.some((p) => paneInfo[p.id]?.ai);
          return (
            <div
              key={t.id}
              className={`tab ${t.id === ws.activeTabId ? 'active' : ''} ${dragOver === t.id ? 'drag-over' : ''}`}
              onMouseDown={(e) => e.button === 0 && S.switchTab(t.id)}
              onAuxClick={(e) => e.button === 1 && S.closeTab(t.id)}
              onDoubleClick={() => setEditing(t.id)}
              draggable={editing !== t.id}
              onDragStart={(e) => e.dataTransfer.setData('application/x-termc-tab', t.id)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-termc-tab')) {
                  e.preventDefault();
                  setDragOver(t.id);
                }
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                setDragOver(null);
                const id = e.dataTransfer.getData('application/x-termc-tab');
                if (id) S.moveTab(id, i);
              }}
              title={i < 9 ? `⌘${i + 1}` : undefined}
            >
              {ai ? <Icon name="sparkles" size={12} className="tab-icon ai" /> : busy ? <span className="tab-busy" /> : <Icon name="terminal" size={12} className="tab-icon" />}
              {editing === t.id ? (
                <input
                  className="tab-edit"
                  autoFocus
                  defaultValue={t.title || tabLabel(t, paneInfo, home)}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    S.renameTab(t.id, e.target.value.trim());
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <span className="tab-title">{tabLabel(t, paneInfo, home)}</span>
              )}
              {panes.length > 1 && <span className="tab-count">{panes.length}</span>}
              <button
                className="tab-close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  S.closeTab(t.id);
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          );
        })}
        <button className="tab-new" onClick={() => S.createTab()} title="New tab (⌘T)">
          <Icon name="plus" size={14} />
        </button>
      </div>
      <div className="tabbar-actions">
        <button className="icon-btn" onClick={() => S.splitPane(null, 'row')} title="Split right (⌘D)"><Icon name="splitH" size={15} /></button>
        <button className="icon-btn" onClick={() => S.splitPane(null, 'column')} title="Split down (⇧⌘D)"><Icon name="splitV" size={15} /></button>
        <button className="icon-btn palette-btn" onClick={() => S.openOverlay({ type: 'palette' })} title="Command palette / AI (⌘K)">
          <Icon name="search" size={13} />
          <span>Search or ask AI</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </div>
  );
}
