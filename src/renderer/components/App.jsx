import { useEffect } from 'react';
import { useStore, activeWorkspace } from '../store';
import { applyCurrentTheme } from '../theme-registry';
import * as terminals from '../terminals';
import Rail from './Rail';
import TabBar from './TabBar';
import Workspace from './Workspace';
import Sidebar from './Sidebar';
import Preview from './Preview';
import StatusBar from './StatusBar';
import Overlays from './Overlays';
import Toasts from './Toasts';
import ContextMenu from './ContextMenu';
import { usePresence } from '../motion';

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const themes = useStore((s) => s.plugin.themes);
  const sidebarOpen = useStore((s) => s.sidebar.open);
  const previewOpen = useStore((s) => s.preview.open);
  const ws = useStore((s) => activeWorkspace(s));
  const workspaces = useStore((s) => s.workspaces);
  const [sidebarMounted, sidebarShown] = usePresence(sidebarOpen, 220);
  const [previewMounted, previewShown] = usePresence(previewOpen, 240);

  useEffect(() => {
    // Briefly transition every surface's colors so theme switches cross-fade.
    const root = document.documentElement;
    root.classList.add('theme-fade');
    applyCurrentTheme();
    terminals.applyTheme();
    const t = setTimeout(() => root.classList.remove('theme-fade'), 400);
    return () => clearTimeout(t);
  }, [theme, themes]);

  return (
    <div className="app">
      <TabBar />
      <Rail />
      {sidebarMounted && <Sidebar shown={sidebarShown} />}
      <main className="main">
        <div className="content">
          <div className="workspaces">
            {workspaces.map((w) => (
              <Workspace key={w.id} workspace={w} visible={w.id === ws?.id} />
            ))}
          </div>
          {previewMounted && <Preview shown={previewShown} />}
        </div>
      </main>
      <StatusBar />
      <Overlays />
      <Toasts />
      <ContextMenu />
    </div>
  );
}
