import { useEffect, useState } from 'react';
import * as S from '../store';
import * as SP from '../spotify';
import { PanelHeader, Empty } from './Sidebar';
import Icon from './Icon';

const api = window.termc;
const KIND_ICON = { playlist: 'list', album: 'disc', track: 'music', artist: 'user', show: 'music', episode: 'music' };

// Re-render every `ms` while playing so the progress bar moves between Spotify updates.
function useNow(active, ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

// ---------------- Sidebar panel ----------------
export function SpotifyPanel() {
  const { status, error, launching } = SP.useSpotify();
  const favs = S.useStore((s) => s.settings?.spotify?.favorites || []);
  useEffect(() => {
    SP.refresh();
  }, []);

  let body;
  if (!status && !error) body = null;
  else if (error && !status?.running) body = <PermissionHelp error={error} />;
  else if (status?.unsupported) body = <Empty text="Spotify control is available on macOS." />;
  else if (!status.installed)
    body = (
      <Empty text="Spotify isn't installed on this Mac.">
        <button className="btn sm primary" onClick={() => api.invoke('app:openExternal', 'https://www.spotify.com/download/mac/')}>Get Spotify</button>
      </Empty>
    );
  else if (!status.running)
    body = (
      <Empty text="Spotify isn't open. TermC starts it in the background, so you stay here.">
        <button className="btn sm primary" disabled={launching} onClick={() => SP.launch()}>
          <Icon name="play" size={12} fill /> {launching ? 'Opening…' : 'Open Spotify'}
        </button>
      </Empty>
    );
  else body = <NowPlaying status={status} />;

  return (
    <div className="panel spotify-panel">
      <PanelHeader title="Spotify" sub={status?.running ? (status.state === 'playing' ? 'Playing' : status.state === 'paused' ? 'Paused' : 'Stopped') : null}>
        {status?.running && (
          <button className="icon-btn" title="Show the Spotify app" onClick={() => api.invoke('spotify:show')}><Icon name="external" size={14} /></button>
        )}
        <button className="icon-btn" title="Refresh" onClick={() => SP.refresh()}><Icon name="refresh" size={14} /></button>
      </PanelHeader>
      <div className="panel-body">
        {body}
        {status?.installed && <Playlists favs={favs} running={status.running} />}
      </div>
      <div className="panel-hint">⌥⌘P play/pause · ⌥⌘. next · ⌥⌘, previous</div>
    </div>
  );
}

function PermissionHelp({ error }) {
  const perm = /permission/i.test(error);
  return (
    <Empty text={error}>
      {perm && <button className="btn sm" onClick={() => api.invoke('spotify:openPrivacy')}>Open Automation Settings</button>}
      <button className="btn sm ghost" onClick={() => SP.refresh()}>Try again</button>
    </Empty>
  );
}

function NowPlaying({ status }) {
  const t = status.track;
  const playing = status.state === 'playing';
  const now = useNow(playing);
  const [scrub, setScrub] = useState(null);
  const pos = scrub ?? SP.positionOf(status, now);
  const dur = t?.duration || 0;
  const favs = S.useStore((s) => s.settings?.spotify?.favorites || []);
  const saved = t && favs.some((f) => f.uri === t.id);

  return (
    <div className="sp-now">
      <div className="sp-art-wrap">
        {t?.artwork && <img className="sp-art-glow" src={t.artwork} alt="" aria-hidden="true" />}
        {t?.artwork ? <img className="sp-art" src={t.artwork} alt="" key={t.artwork} /> : <div className="sp-art sp-art-empty"><Icon name="music" size={34} /></div>}
      </div>
      <div className="sp-meta">
        <div className="sp-title-row">
          <div className="sp-title" title={t?.name}>{t?.name || 'Nothing playing'}</div>
          {t && (
            <button className={`icon-btn sp-heart ${saved ? 'on' : ''}`} title={saved ? 'Remove from your list' : 'Save this song to your list'} onClick={() => (saved ? SP.removeFavorite(t.id) : SP.addFavorite(`${t.name} · ${t.artist}`, t.id))}>
              <Icon name="heart" size={14} fill={saved} />
            </button>
          )}
        </div>
        <div className="sp-artist" title={t ? `${t.artist} · ${t.album}` : ''}>{t ? `${t.artist} · ${t.album}` : 'Pick a playlist below'}</div>
      </div>
      <div className="sp-progress">
        <input
          type="range"
          min={0}
          max={dur || 1}
          step={0.5}
          value={Math.min(pos, dur || 1)}
          disabled={!t}
          style={{ '--pct': `${dur ? (pos / dur) * 100 : 0}%` }}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={(e) => {
            SP.seek(Number(e.currentTarget.value));
            setScrub(null);
          }}
          onKeyUp={(e) => {
            if (scrub == null) return;
            SP.seek(scrub);
            setScrub(null);
          }}
          aria-label="Seek"
        />
        <div className="sp-times">
          <span>{SP.fmtTime(pos)}</span>
          <span>{SP.fmtTime(dur)}</span>
        </div>
      </div>
      <div className="sp-controls">
        <button className={`sp-btn ${status.shuffling ? 'on' : ''}`} title={status.shuffling ? 'Shuffle on' : 'Shuffle off'} onClick={() => SP.setShuffle(!status.shuffling)}><Icon name="shuffle" size={16} /></button>
        <button className="sp-btn" title="Previous (⌥⌘,)" onClick={SP.previous}><Icon name="skipBack" size={18} fill /></button>
        <button className="sp-play" title={playing ? 'Pause (⌥⌘P)' : 'Play (⌥⌘P)'} onClick={SP.togglePlay}>
          <Icon name={playing ? 'pause' : 'play'} size={18} fill strokeWidth={1.2} />
        </button>
        <button className="sp-btn" title="Next (⌥⌘.)" onClick={SP.next}><Icon name="skipForward" size={18} fill /></button>
        <button className={`sp-btn ${status.repeating ? 'on' : ''}`} title={status.repeating ? 'Repeat on' : 'Repeat off'} onClick={() => SP.setRepeat(!status.repeating)}><Icon name="repeat" size={16} /></button>
      </div>
      <div className="sp-volume">
        <button className="icon-btn" title={status.volume ? 'Mute' : 'Unmute'} onClick={() => SP.setVolume(status.volume ? 0 : 60)}>
          <Icon name={status.volume ? 'volume' : 'volumeOff'} size={14} />
        </button>
        <input type="range" min={0} max={100} value={status.volume} style={{ '--pct': `${status.volume}%` }} onChange={(e) => SP.setVolume(Number(e.target.value))} aria-label="Volume" />
        <span className="sp-vol-num">{status.volume}</span>
      </div>
    </div>
  );
}

function Playlists({ favs, running }) {
  const [link, setLink] = useState('');
  const [err, setErr] = useState(null);
  const [dragUri, setDragUri] = useState(null);
  const valid = !!SP.toUri(link);

  const play = async (f) => {
    try {
      if (!running) await SP.launch();
      await SP.playUri(f.uri, f.name);
    } catch {}
  };
  const playLink = async () => {
    if (!valid) return setErr('Paste a Spotify link, e.g. https://open.spotify.com/playlist/…');
    setErr(null);
    await play({ uri: SP.toUri(link) });
    setLink('');
  };
  const saveLink = () => {
    if (!valid) return setErr('Paste a Spotify link, e.g. https://open.spotify.com/playlist/…');
    setErr(null);
    const uri = SP.toUri(link);
    S.openOverlay({
      type: 'prompt',
      title: 'Name it',
      value: SP.kindOf(uri).replace(/^./, (c) => c.toUpperCase()),
      onSubmit: (name) => {
        SP.addFavorite(name || '', uri);
        setLink('');
      },
    });
  };
  const menu = (e, f) => {
    e.preventDefault();
    S.setState({
      contextMenu: {
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Play', run: () => play(f) },
          { label: 'Rename…', run: () => S.openOverlay({ type: 'prompt', title: 'Rename', value: f.name, onSubmit: (v) => v && SP.renameFavorite(f.uri, v) }) },
          { label: 'Copy Link', run: () => navigator.clipboard.writeText(`https://open.spotify.com/${SP.kindOf(f.uri)}/${f.uri.split(':')[2]}`) },
          { type: 'sep' },
          { label: 'Remove', danger: true, run: () => SP.removeFavorite(f.uri) },
        ],
      },
    });
  };

  return (
    <div className="sp-lists">
      <div className="section-label">Your music</div>
      {!favs.length && <div className="panel-note">Paste a playlist, album or song link below to keep it here.</div>}
      {favs.map((f, i) => (
        <div
          key={f.uri}
          className={`run-item sp-fav ${dragUri === f.uri ? 'dragging' : ''}`}
          onClick={() => play(f)}
          onContextMenu={(e) => menu(e, f)}
          title={`Play ${f.name}`}
          draggable
          onDragStart={(e) => {
            setDragUri(f.uri);
            e.dataTransfer.setData('application/x-termc-sp', f.uri);
          }}
          onDragEnd={() => setDragUri(null)}
          onDragOver={(e) => e.dataTransfer.types.includes('application/x-termc-sp') && e.preventDefault()}
          onDrop={(e) => {
            const uri = e.dataTransfer.getData('application/x-termc-sp');
            if (uri) SP.moveFavorite(uri, i);
          }}
        >
          <span className="sp-fav-icon"><Icon name={KIND_ICON[SP.kindOf(f.uri)] || 'music'} size={13} /></span>
          <div className="run-text">
            <span className="run-name">{f.name}</span>
            <span className="sp-kind">{SP.kindOf(f.uri)}</span>
          </div>
          <div className="run-actions">
            <button className="icon-btn" title="Play" onClick={(e) => { e.stopPropagation(); play(f); }}><Icon name="play" size={12} fill /></button>
            <button className="icon-btn" title="Remove" onClick={(e) => { e.stopPropagation(); SP.removeFavorite(f.uri); }}><Icon name="x" size={12} /></button>
          </div>
        </div>
      ))}
      <div className="sp-add">
        <input
          value={link}
          placeholder="Paste a Spotify link…"
          spellCheck={false}
          onChange={(e) => {
            setLink(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey ? saveLink() : playLink())}
        />
        <button className="btn sm" disabled={!link} onClick={playLink} title="Play now (↩)">Play</button>
        <button className="btn sm ghost" disabled={!link} onClick={saveLink} title="Save to your list (⌘↩)">Save</button>
      </div>
      {err && <div className="sp-err">{err}</div>}
      <div className="panel-note">In Spotify: ⋯ → Share → Copy link. Works for playlists, albums, songs, artists and podcasts.</div>
    </div>
  );
}

// ---------------- Status bar mini player ----------------
export function MiniPlayer() {
  const status = SP.useSpotify((s) => s.status);
  const show = S.useStore((s) => s.settings?.spotify?.enabled !== false && s.settings?.spotify?.statusBar !== false);
  const playing = status?.state === 'playing';
  const now = useNow(show && playing, 1000);
  if (!show || !status?.running || !status.track) return null;
  const t = status.track;
  const pct = t.duration ? (SP.positionOf(status, now) / t.duration) * 100 : 0;
  return (
    <div className={`sb-player ${playing ? 'playing' : ''}`}>
      <button className="sb-item sb-track" onClick={() => S.toggleSidebar('spotify')} title={`${t.name} · ${t.artist}\nClick to open the player (⇧⌘M)`}>
        {playing ? <span className="sb-eq"><i /><i /><i /></span> : <Icon name="music" size={12} />}
        <span className="sb-track-text">{t.name}<span className="sb-dim"> · {t.artist}</span></span>
        <span className="sb-track-bar" style={{ width: `${pct}%` }} />
      </button>
      <button className="sb-mini" title="Previous" onClick={SP.previous}><Icon name="skipBack" size={10} fill /></button>
      <button className="sb-mini" title={playing ? 'Pause' : 'Play'} onClick={SP.togglePlay}><Icon name={playing ? 'pause' : 'play'} size={11} fill strokeWidth={1} /></button>
      <button className="sb-mini" title="Next" onClick={SP.next}><Icon name="skipForward" size={10} fill /></button>
    </div>
  );
}
