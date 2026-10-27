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
import ErrorBoundary from './ErrorBoundary';

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
      <ErrorBoundary name="Tab bar">
        <TabBar />
      </ErrorBoundary>
      <ErrorBoundary name="Sidebar rail">
        <Rail />
      </ErrorBoundary>
      {sidebarMounted && (
        <ErrorBoundary name="Sidebar">
          <Sidebar shown={sidebarShown} />
        </ErrorBoundary>
      )}
      <main className="main">
        <div className="content">
          <div className="workspaces">
            {workspaces.map((w) => (
              <ErrorBoundary key={w.id} name={`Workspace ${w.name}`}>
                <Workspace workspace={w} visible={w.id === ws?.id} />
              </ErrorBoundary>
            ))}
          </div>
          {previewMounted && (
            <ErrorBoundary name="Preview">
              <Preview shown={previewShown} />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <ErrorBoundary name="Status bar">
        <StatusBar />
      </ErrorBoundary>
      <ErrorBoundary name="Dialog">
        <Overlays />
      </ErrorBoundary>
      <ErrorBoundary silent>
        <Toasts />
        <ContextMenu />
      </ErrorBoundary>
    </div>
  );
}
