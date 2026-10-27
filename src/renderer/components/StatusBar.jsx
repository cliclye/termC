import { useEffect, useState } from 'react';
import * as S from '../store';
import { runCommand } from '../commands';
import Icon from './Icon';
import { MiniPlayer } from './Spotify';

const api = window.termc;

export function useGitStatus(cwd, deps = []) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => cwd && api.invoke('git:status', cwd).then((r) => alive && setSt(r)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [cwd, ...deps]);
  return st;
}

export default function StatusBar() {
  const paneId = S.useStore((s) => S.activePaneId(s));
  const info = S.useStore((s) => s.paneInfo[paneId]);
  const cwd = S.useStore((s) => S.activeCwd(s));
  const home = S.useStore((s) => s.appInfo?.homeDir);
  const servers = S.useStore((s) => s.devServers);
  const items = S.useStore((s) => s.plugin.statusItems);
  const git = useGitStatus(cwd, [info?.lastExit]);
  const shortCwd = home && cwd?.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;

  return (
    <footer className="statusbar">
      <div className="sb-left">
        <button className="sb-item" onClick={() => S.showSidebar('files')} title={cwd}>
          <Icon name="folder" size={12} />
          <span className="sb-cwd">{shortCwd}</span>
        </button>
        {git?.repo && (
          <button className="sb-item" onClick={() => S.toggleSidebar('git')} title="Git (⌘G)">
            <Icon name="branch" size={12} />
            {git.branch}
            {git.files.length > 0 && <span className="sb-badge">{git.files.length}</span>}
            {git.ahead > 0 && <span className="sb-dim">↑{git.ahead}</span>}
            {git.behind > 0 && <span className="sb-dim">↓{git.behind}</span>}
          </button>
        )}
        {info?.ai && (
          <span className="sb-item ai">
            <Icon name="sparkles" size={12} />
            {info.ai.name}
          </span>
        )}
        {info && !info.ai && info.running && info.process && (
          <span className="sb-item">
            <span className="sb-pulse" />
            {info.process}
          </span>
        )}
        {info && !info.running && info.lastExit > 0 && <span className="sb-item danger">exit {info.lastExit}</span>}
      </div>
      <div className="sb-right">
        <MiniPlayer />
        {Object.values(items).map((it) => (
          <button key={it.key} className="sb-item" style={it.color ? { color: it.color } : undefined} title={it.tooltip} onClick={() => it.command && runCommand(it.command)}>
            {it.icon && <Icon name={it.icon} size={12} />}
            {it.text}
          </button>
        ))}
        {servers.map((s) => (
          <button key={s.key} className="sb-item server" onClick={() => S.openPreview(s.url)} title={`Preview ${s.url}`}>
            <span className="sb-live" />
            {s.framework} :{s.port}
          </button>
        ))}
        <button className="sb-item" onClick={() => runCommand('settings.mcp')} title="MCP server for Claude, Cursor, Windsurf">
          <span className="sb-live mcp" />
          MCP
        </button>
      </div>
    </footer>
  );
}
