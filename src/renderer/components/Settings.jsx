import { useEffect, useState } from 'react';
import * as S from '../store';
import * as terminals from '../terminals';
import { shellQuote } from '../control';
import { allThemes } from '../theme-registry';
import { COMMANDS, prettyKeys } from '../commands';
import { setPluginEnabled, startPlugin, stopPlugin } from '../plugin-host';
import Icon from './Icon';

const api = window.termc;
const SECTIONS = [
  ['general', 'General', 'terminal'],
  ['appearance', 'Appearance', 'palette'],
  ['ai', 'AI', 'sparkles'],
  ['aliases', 'Aliases', 'bolt'],
  ['screenshots', 'Screenshots', 'camera'],
  ['mcp', 'MCP', 'link'],
  ['spotify', 'Spotify', 'music'],
  ['plugins', 'Plugins', 'puzzle'],
  ['store', 'Plugin Store', 'store'],
  ['shortcuts', 'Shortcuts', 'keyboard'],
];

export default function Settings({ overlay, close }) {
  const [section, setSection] = useState(overlay.section || 'general');
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="settings">
      <nav className="settings-nav">
        <div className="settings-brand">Settings</div>
        {SECTIONS.map(([id, label, icon]) => (
          <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
        <div className="grow" />
        <div className="settings-free">TermC is free and open — every feature, no account.</div>
      </nav>
      <div className="settings-body">
        <button className="icon-btn settings-close" onClick={close}><Icon name="x" size={16} /></button>
        <div className="settings-section" key={section}>
        {section === 'general' && <General />}
        {section === 'appearance' && <Appearance />}
        {section === 'ai' && <AiSettings />}
        {section === 'aliases' && <Aliases />}
        {section === 'screenshots' && <Screenshots />}
        {section === 'mcp' && <Mcp />}
        {section === 'spotify' && <SpotifySettings />}
        {section === 'plugins' && <Plugins goStore={() => setSection('store')} />}
        {section === 'store' && <Store />}
        {section === 'shortcuts' && <Shortcuts />}
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, hint, children }) => (
  <div className="set-row">
    <div className="set-label">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </div>
    <div className="set-control">{children}</div>
  </div>
);

function Toggle({ value, onChange }) {
  return <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button>;
}

function General() {
  const s = S.useStore((x) => x.settings);
  const set = (patch) => S.saveSettings(patch);
  return (
    <>
      <h2>General</h2>
      <Row label="Shell" hint="Used for new terminals. zsh, bash and fish get full integration.">
        <input value={s.shell} onChange={(e) => set({ shell: e.target.value })} spellCheck={false} />
      </Row>
      <Row label="Font family">
        <input value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} spellCheck={false} />
      </Row>
      <Row label="Font size">
        <div className="stepper">
          <button onClick={() => set({ fontSize: Math.max(8, s.fontSize - 1) })}>−</button>
          <span>{s.fontSize}</span>
          <button onClick={() => set({ fontSize: Math.min(32, s.fontSize + 1) })}>+</button>
        </div>
      </Row>
      <Row label="Line height">
        <select value={s.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })}>
          {[1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Row>
      <Row label="Cursor">
        <div className="seg small">
          {['bar', 'block', 'underline'].map((c) => <button key={c} className={s.cursorStyle === c ? 'active' : ''} onClick={() => set({ cursorStyle: c })}>{c}</button>)}
        </div>
      </Row>
      <Row label="Blinking cursor"><Toggle value={s.cursorBlink} onChange={(v) => set({ cursorBlink: v })} /></Row>
      <Row label="Scrollback lines">
        <input type="number" min={1000} max={200000} step={1000} value={s.scrollback} onChange={(e) => set({ scrollback: Number(e.target.value) })} />
      </Row>
      <Row label="Option key as Meta" hint="Needed for Alt-shortcuts in emacs, tmux and some TUIs."><Toggle value={s.optionAsMeta} onChange={(v) => set({ optionAsMeta: v })} /></Row>
      <Row label="Copy on select"><Toggle value={s.copyOnSelect} onChange={(v) => set({ copyOnSelect: v })} /></Row>
      <Row label="Restore sessions" hint="Reopen workspaces, layouts and terminal scrollback after restart."><Toggle value={s.restoreSessions} onChange={(v) => set({ restoreSessions: v })} /></Row>
      <Row label="Confirm before quitting" hint="Ask first when quitting would stop running programs."><Toggle value={s.confirmQuit !== false} onChange={(v) => set({ confirmQuit: v })} /></Row>
    </>
  );
}

function Appearance() {
  const current = S.useStore((x) => x.settings.theme);
  S.useStore((x) => x.plugin.themes);
  return (
    <>
      <h2>Appearance</h2>
      <div className="theme-grid">
        {allThemes().map((t) => (
          <button key={t.id} className={`theme-card ${t.id === current ? 'on' : ''}`} onClick={() => S.saveSettings({ theme: t.id })}>
            <div className="theme-preview" style={{ background: t.term.background, color: t.term.foreground }}>
              <div><span style={{ color: t.term.green }}>➜</span> <span style={{ color: t.term.cyan }}>~/app</span> <span style={{ color: t.term.magenta }}>git:(main)</span></div>
              <div>$ npm run dev</div>
              <div className="theme-swatches">
                {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((c) => <i key={c} style={{ background: t.term[c] }} />)}
              </div>
            </div>
            <div className="theme-name">
              {t.name}
              {t.plugin && <span className="pill">plugin</span>}
              {t.id === current && <Icon name="check" size={13} />}
            </div>
          </button>
        ))}
      </div>
      <p className="muted">Install the Theme Pack from the Plugin Store for more themes, or ship your own with <code>termc.themes.register()</code>.</p>
    </>
  );
}

function AiSettings() {
  const ai = S.useStore((x) => x.settings.ai);
  const [prov, setProv] = useState(null);
  useEffect(() => {
    api.invoke('ai:providers').then(setProv);
  }, []);
  const set = (patch) => S.saveSettings({ ai: { ...ai, ...patch } });
  const opts = [
    ['auto', 'Automatic', 'Claude Code CLI → Ollama → API keys'],
    ['claude-cli', 'Claude Code CLI', prov ? (prov.claudeCli ? 'Installed · uses your Claude login' : 'Not found') : ''],
    ['ollama', 'Ollama (local)', prov ? (prov.ollama ? `Running · ${prov.ollamaModels.length} models` : 'Not running') : ''],
    ['anthropic', 'Anthropic API', 'Your own API key'],
    ['openai', 'OpenAI-compatible API', 'OpenAI, Groq, LM Studio, …'],
  ];
  return (
    <>
      <h2>AI</h2>
      <p className="muted">⌘K turns plain English into a shell command. TermC has no paid tier — it uses AI you already have: the Claude Code CLI, a local Ollama model, or your own API key.</p>
      <div className="provider-list">
        {opts.map(([id, label, hint]) => (
          <button key={id} className={`provider ${ai.provider === id ? 'on' : ''}`} onClick={() => set({ provider: id })}>
            <span className="radio" />
            <span className="provider-label">{label}</span>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      {(ai.provider === 'ollama' || ai.provider === 'auto') && (
        <Row label="Ollama model">
          {prov?.ollamaModels?.length ? (
            <select value={ai.ollamaModel} onChange={(e) => set({ ollamaModel: e.target.value })}>
              {[...new Set([ai.ollamaModel, ...prov.ollamaModels])].map((m) => <option key={m}>{m}</option>)}
            </select>
          ) : (
            <input value={ai.ollamaModel} onChange={(e) => set({ ollamaModel: e.target.value })} />
          )}
        </Row>
      )}
      {(ai.provider === 'anthropic' || ai.provider === 'auto') && (
        <>
          <Row label="Anthropic API key" hint="Stored encrypted with the macOS keychain.">
            <input type="password" value={ai.anthropicKey} placeholder="sk-ant-…" onChange={(e) => set({ anthropicKey: e.target.value })} />
          </Row>
          <Row label="Anthropic model"><input value={ai.anthropicModel} onChange={(e) => set({ anthropicModel: e.target.value })} /></Row>
        </>
      )}
      {(ai.provider === 'openai' || ai.provider === 'auto') && (
        <>
          <Row label="API base URL"><input value={ai.openaiBaseUrl} onChange={(e) => set({ openaiBaseUrl: e.target.value })} /></Row>
          <Row label="API key"><input type="password" value={ai.openaiKey} onChange={(e) => set({ openaiKey: e.target.value })} /></Row>
          <Row label="Model"><input value={ai.openaiModel} onChange={(e) => set({ openaiModel: e.target.value })} /></Row>
        </>
      )}
      <TestAi />
    </>
  );
}

function TestAi() {
  const [r, setR] = useState(null);
  const test = async () => {
    setR({ loading: true });
    try {
      setR(await api.invoke('ai:generate', { query: 'list files sorted by size', cwd: S.activeCwd() }));
    } catch (e) {
      setR({ error: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    }
  };
  return (
    <div className="test-ai">
      <button className="btn" onClick={test} disabled={r?.loading}>{r?.loading ? 'Testing…' : 'Test AI command'}</button>
      {r?.command && <code>{r.command}</code>}
      {r?.error && <span className="danger-text">{r.error}</span>}
    </div>
  );
}

function Aliases() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.invoke('aliases:list').then(setList);
  }, []);
  const save = async (next) => {
    setList(next);
    try {
      await api.invoke('aliases:save', next.filter((a) => a.name && a.command));
      setErr('');
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (e) {
      setErr(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };
  if (!list) return null;
  return (
    <>
      <h2>Aliases {saved && <span className="saved">Saved · live in all terminals</span>}</h2>
      <p className="muted">Shortcuts for commands you type often. They work in zsh, bash and fish, and reload instantly in every open terminal at the next prompt.</p>
      <div className="alias-table">
        {list.map((a, i) => (
          <div key={i} className="alias-row">
            <input className="alias-name" value={a.name} placeholder="name" spellCheck={false} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} onBlur={() => save(list)} />
            <span className="alias-arrow">→</span>
            <input className="alias-cmd" value={a.command} placeholder="command" spellCheck={false} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))} onBlur={() => save(list)} />
            <button className="icon-btn" onClick={() => save(list.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      {err && <div className="danger-text">{err}</div>}
      <button className="btn" onClick={() => setList([...list, { name: '', command: '' }])}><Icon name="plus" size={13} /> Add alias</button>
    </>
  );
}

function ShortcutRecorder({ value, onChange }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRec(false);
      if (['Meta', 'Shift', 'Alt', 'Control'].includes(e.key)) return;
      const parts = [];
      if (e.metaKey) parts.push('CommandOrControl');
      if (e.ctrlKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (!parts.length) return;
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      onChange(parts.join('+'));
      setRec(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rec]);
  const pretty = value ? value.replace('CommandOrControl', '⌘').replace('Control', '⌃').replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '') : 'None';
  return (
    <div className="recorder">
      <button className={`btn ${rec ? 'primary' : ''}`} onClick={() => setRec(!rec)}>{rec ? 'Press keys…' : pretty}</button>
      {value && <button className="btn ghost" onClick={() => onChange('')}>Clear</button>}
    </div>
  );
}

function Screenshots() {
  const s = S.useStore((x) => x.settings);
  const [list, setList] = useState([]);
  const [project, setProject] = useState('all');
  const load = () => api.invoke('screenshots:list').then(setList);
  useEffect(() => {
    load();
  }, []);
  const projects = [...new Set(list.map((x) => x.project))];
  const shown = list.filter((x) => project === 'all' || x.project === project);
  return (
    <>
      <h2>Screenshots</h2>
      <p className="muted">Press the shortcut anywhere on your Mac, select a region (Space switches to window mode), and the image path is pasted into the focused pane — Claude Code attaches it as <code>[Image #N]</code>. macOS will ask for Screen Recording permission the first time.</p>
      <Row label="Global shortcut"><ShortcutRecorder value={s.screenshotShortcut} onChange={(v) => S.saveSettings({ screenshotShortcut: v })} /></Row>
      <Row label="Folder" hint="Screenshots are grouped by project.">
        <button className="btn" onClick={() => api.invoke('screenshots:openDir')}><Icon name="external" size={13} /> Open in Finder</button>
      </Row>
      <div className="shots-head">
        <div className="seg small">
          <button className={project === 'all' ? 'active' : ''} onClick={() => setProject('all')}>All</button>
          {projects.map((p) => <button key={p} className={project === p ? 'active' : ''} onClick={() => setProject(p)}>{p}</button>)}
        </div>
        <button className="btn sm" onClick={async () => { S.closeOverlay(); await api.invoke('screenshots:capture'); }}><Icon name="camera" size={13} /> Capture now</button>
      </div>
      <div className="shots">
        {!shown.length && <div className="muted">No screenshots yet.</div>}
        {shown.map((x) => (
          <div key={x.file} className="shot">
            <img src={`file://${encodeURI(x.file)}`} alt={x.name} loading="lazy" />
            <div className="shot-meta">
              <span title={x.name}>{x.project} · {new Date(x.mtime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="shot-actions">
                <button className="icon-btn" title="Insert into terminal" onClick={() => { S.closeOverlay(); terminals.paste(S.activePaneId(), shellQuote(x.file) + ' '); }}><Icon name="terminal" size={13} /></button>
                <button className="icon-btn" title="Show in Finder" onClick={() => api.invoke('fs:reveal', x.file)}><Icon name="folder" size={13} /></button>
                <button className="icon-btn" title="Move to Trash" onClick={async () => { await api.invoke('screenshots:trash', x.file); load(); }}><Icon name="trash" size={13} /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Copyable({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copyable">
      <pre>{text}</pre>
      <button className="btn sm" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}>{ok ? <><Icon name="check" size={12} /> Copied</> : <><Icon name="copy" size={12} /> Copy</>}</button>
    </div>
  );
}

function SpotifySettings() {
  const sp = S.useStore((x) => x.settings.spotify) || {};
  const set = (patch) => S.saveSettings({ spotify: { ...sp, ...patch } });
  return (
    <>
      <h2>Spotify</h2>
      <p className="muted">
        Control the Spotify app without leaving TermC: play, pause, skip, seek, volume and your saved playlists. TermC talks to the Spotify app on this Mac, so there's no
        login or API key. The first time, macOS asks whether TermC may control Spotify.
      </p>
      <Row label="Enable Spotify" hint="Shows the player in the sidebar (⇧⌘M) and adds Spotify commands to the palette."><Toggle value={sp.enabled !== false} onChange={(v) => set({ enabled: v })} /></Row>
      <Row label="Mini player in status bar" hint="The current song with previous / play / next buttons."><Toggle value={sp.statusBar !== false} onChange={(v) => set({ statusBar: v })} /></Row>
      <Row label="Saved music" hint="Manage these in the Spotify panel. Each one is also in the command palette as “Spotify: Play …”.">
        <span className="dim">{(sp.favorites || []).length} saved</span>
      </Row>
      <Row label="Keyboard" hint="Change these in Shortcuts.">
        <span className="dim">⌥⌘P play/pause · ⌥⌘. next · ⌥⌘, previous</span>
      </Row>
      <Row label="Permission" hint="If controls stop working, allow TermC → Spotify in Automation settings.">
        <button className="btn sm" onClick={() => api.invoke('spotify:openPrivacy')}>Open Automation Settings</button>
      </Row>
    </>
  );
}

function Mcp() {
  const info = S.useStore((x) => x.appInfo);
  const [ctl, setCtl] = useState(info.control);
  useEffect(() => {
    api.invoke('app:info').then((i) => setCtl(i.control));
  }, []);
  const script = info.mcpScript;
  // TermC's own executable doubles as a Node runtime, so no separate Node install is needed.
  const json = JSON.stringify({ mcpServers: { termc: { command: info.node, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } } } }, null, 2);
  return (
    <>
      <h2>MCP Integration</h2>
      <p className="muted">Let AI agents drive TermC: run commands and read output, split panes, open tabs and workspaces, use Git, browse files and open previews — 70+ tools. The bridge only talks to this app on 127.0.0.1 with a per-launch token.</p>
      <div className="mcp-status"><span className="sb-live mcp" /> Control server listening on 127.0.0.1:{ctl?.port}</div>
      <h3>Claude Code</h3>
      <Copyable text={`claude mcp add --scope user termc -e ELECTRON_RUN_AS_NODE=1 -- "${info.node}" "${script}"`} />
      <h3>Cursor</h3>
      <p className="muted">Add to <code>~/.cursor/mcp.json</code>:</p>
      <Copyable text={json} />
      <h3>Windsurf</h3>
      <p className="muted">Add to <code>~/.codeium/windsurf/mcp_config.json</code>:</p>
      <Copyable text={json} />
      <h3>Example prompts</h3>
      <ul className="examples">
        <li>“Split the terminal and start the dev server on the right, then open the preview.”</li>
        <li>“Run the tests in a new pane and tell me which ones fail.”</li>
        <li>“Create a worktree for feature/auth and open it in a new tab.”</li>
      </ul>
    </>
  );
}

function Plugins({ goStore }) {
  const [list, setList] = useState(null);
  const enabled = S.useStore((x) => x.settings.enabledPlugins || {});
  const load = () => api.invoke('plugins:installed').then(setList);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <h2>Plugins</h2>
      <p className="muted">Plugins run isolated in Web Workers and can add commands, status bar items, panels, context-menu entries, keybindings and themes.</p>
      {list && !list.length && (
        <div className="empty-card">
          No plugins installed. <button className="btn primary sm" onClick={goStore}>Browse the store</button>
        </div>
      )}
      {list?.map((m) => (
        <div key={m.id} className="plugin-card">
          <div className="plugin-icon"><Icon name={m.icon || 'puzzle'} size={18} /></div>
          <div className="plugin-info">
            <div className="plugin-name">{m.name} <span className="dim">v{m.version}</span></div>
            <div className="plugin-desc">{m.description}</div>
            {m.permissions.length > 0 && <div className="perms">{m.permissions.map((p) => <span key={p} className="pill">{p}</span>)}</div>}
          </div>
          <div className="plugin-actions">
            <Toggle value={enabled[m.id] !== false} onChange={(v) => setPluginEnabled(m.id, v)} />
            <button className="icon-btn" title="Reload" onClick={() => startPlugin(m)}><Icon name="refresh" size={14} /></button>
            <button className="icon-btn" title="Uninstall" onClick={async () => { stopPlugin(m.id); await api.invoke('plugins:uninstall', m.id); load(); }}><Icon name="trash" size={14} /></button>
          </div>
        </div>
      ))}
    </>
  );
}

function Store() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api.invoke('plugins:catalog').then(setList);
  useEffect(() => {
    load();
  }, []);
  const install = async (m) => {
    const manifest = await api.invoke('plugins:install', m.id);
    await setPluginEnabled(m.id, true);
    S.toast(`${manifest.name} installed`, { kind: 'success' });
    load();
  };
  const shown = (list || []).filter((m) => !q || (m.name + m.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h2>Plugin Store</h2>
      <div className="panel-search boxed">
        <Icon name="search" size={13} />
        <input placeholder="Search plugins" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="store-grid">
        {shown.map((m) => (
          <div key={m.id} className="store-card">
            <div className="store-top">
              <div className="plugin-icon"><Icon name={m.icon || 'puzzle'} size={18} /></div>
              <div>
                <div className="plugin-name">{m.name}</div>
                <div className="dim small">{m.author} · v{m.version}</div>
              </div>
            </div>
            <div className="plugin-desc">{m.description}</div>
            <div className="store-foot">
              <div className="perms">{(m.permissions || []).map((p) => <span key={p} className="pill">{p}</span>)}</div>
              {m.installed ? (
                m.installedVersion !== m.version ? <button className="btn sm primary" onClick={() => install(m)}>Update</button> : <span className="installed"><Icon name="check" size={13} /> Installed</span>
              ) : (
                <button className="btn sm primary" onClick={() => install(m)}>Install</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="muted">Build your own: drop a folder with <code>manifest.json</code> and <code>main.js</code> into <code>~/.termc/plugins/</code>.</p>
    </>
  );
}

function Shortcuts() {
  const groups = {};
  for (const c of COMMANDS) if (c.keys && !c.hidden) (groups[c.category] ||= []).push(c);
  return (
    <>
      <h2>Keyboard Shortcuts</h2>
      <div className="shortcut-grid">
        {Object.entries(groups).map(([cat, cmds]) => (
          <div key={cat} className="shortcut-group">
            <h3>{cat}</h3>
            {cmds.map((c) => (
              <div key={c.id} className="shortcut-row"><span>{c.title}</span><kbd>{prettyKeys(c.keys)}</kbd></div>
            ))}
          </div>
        ))}
        <div className="shortcut-group">
          <h3>More</h3>
          <div className="shortcut-row"><span>Switch tab 1–9</span><kbd>⌘1–9</kbd></div>
          <div className="shortcut-row"><span>Switch workspace 1–9</span><kbd>⌥⌘1–9</kbd></div>
          <div className="shortcut-row"><span>Screenshot to terminal (global)</span><kbd>⇧⌘S</kbd></div>
        </div>
      </div>
    </>
  );
}
