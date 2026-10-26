import { useState } from 'react';
import * as S from '../store';
import Icon from './Icon';

const initials = (name) => {
  const words = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  return ((words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)) || '?').toUpperCase();
};

export default function Rail() {
  const workspaces = S.useStore((s) => s.workspaces);
  const activeId = S.useStore((s) => s.activeWorkspaceId);
  const sidebar = S.useStore((s) => s.sidebar);
  const panels = S.useStore((s) => s.plugin.panels);
  const previewOpen = S.useStore((s) => s.preview.open);
  const servers = S.useStore((s) => s.devServers.length);
  const [dragId, setDragId] = useState(null);

  const views = [
    { id: 'files', icon: 'folder', title: 'Files (⌘B)' },
    { id: 'git', icon: 'branch', title: 'Git (⌘G)' },
    { id: 'run', icon: 'play', title: 'Run commands (⇧⌘R)' },
    { id: 'sessions', icon: 'sparkles', title: 'AI sessions (⇧⌘A)' },
    ...Object.values(panels).map((p) => ({ id: `plugin:${p.id}`, icon: p.icon || 'puzzle', title: p.title })),
  ];

  const wsMenu = (e, w) => {
    e.preventDefault();
    S.setState({
      contextMenu: {
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Rename…', run: () => S.openOverlay({ type: 'prompt', title: 'Rename workspace', value: w.name, onSubmit: (v) => v && S.renameWorkspace(w.id, v) }) },
          { type: 'colors', colors: S.WORKSPACE_COLORS, value: w.color, run: (c) => S.setWorkspaceColor(w.id, c) },
          { type: 'sep' },
          { label: 'New Tab Here', run: () => S.createTab({ workspaceId: w.id, cwd: w.cwd }) },
          { label: 'Close Workspace', danger: true, run: () => S.deleteWorkspace(w.id) },
        ],
      },
    });
  };

  return (
    <nav className="rail">
      <div className="rail-workspaces">
        {workspaces.map((w, i) => (
          <button
            key={w.id}
            className={`ws-avatar ${w.id === activeId ? 'active' : ''} ${dragId === w.id ? 'dragging' : ''}`}
            style={{ '--ws': w.color }}
            onClick={() => S.switchWorkspace(w.id)}
            onContextMenu={(e) => wsMenu(e, w)}
            draggable
            onDragStart={(e) => {
              setDragId(w.id);
              e.dataTransfer.setData('application/x-termc-ws', w.id);
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.dataTransfer.types.includes('application/x-termc-ws') && e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-termc-ws');
              if (id) S.moveWorkspace(id, i);
            }}
            data-tip={`${w.name} · ${w.tabs.length} tab${w.tabs.length === 1 ? '' : 's'}${i < 9 ? ` · ⌥⌘${i + 1}` : ''}`}
          >
            <span>{initials(w.name)}</span>
          </button>
        ))}
        <button className="rail-btn add" onClick={() => S.openOverlay({ type: 'workspace' })} data-tip="New workspace (⇧⌘N)">
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="rail-views">
        {views.map((v) => (
          <button key={v.id} className={`rail-btn ${sidebar.open && sidebar.view === v.id ? 'active' : ''}`} onClick={() => S.toggleSidebar(v.id)} data-tip={v.title}>
            <Icon name={v.icon} size={18} />
          </button>
        ))}
        <button className={`rail-btn ${previewOpen ? 'active' : ''}`} onClick={() => (previewOpen ? S.closePreview() : S.openPreview())} data-tip="Dev server preview (⇧⌘B)">
          <Icon name="globe" size={18} />
          {servers > 0 && <span className="rail-dot" />}
        </button>
        <div className="rail-sep" />
        <button className="rail-btn" onClick={() => S.openOverlay({ type: 'settings', section: 'store' })} data-tip="Plugin store (⇧⌘X)">
          <Icon name="store" size={18} />
        </button>
        <button className="rail-btn" onClick={() => S.openOverlay({ type: 'settings' })} data-tip="Settings (⌘,)">
          <Icon name="settings" size={18} />
        </button>
      </div>
    </nav>
  );
}
