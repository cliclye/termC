import { useEffect, useRef, useState } from 'react';
import * as S from '../store';
import Icon from './Icon';

const api = window.termc;

export default function Preview({ shown }) {
  const preview = S.useStore((s) => s.preview);
  const servers = S.useStore((s) => s.devServers);
  const view = useRef(null);
  const [input, setInput] = useState(preview.url);
  const [loading, setLoading] = useState(false);
  const [nav, setNav] = useState({ back: false, fwd: false });

  useEffect(() => setInput(preview.url), [preview.url]);

  useEffect(() => {
    const wv = view.current;
    if (!wv) return;
    const upd = () => {
      try {
        setNav({ back: wv.canGoBack(), fwd: wv.canGoForward() });
        setInput(wv.getURL());
      } catch {}
    };
    const start = () => setLoading(true);
    const stop = () => {
      setLoading(false);
      upd();
    };
    const reload = () => wv.reload();
    wv.addEventListener('did-start-loading', start);
    wv.addEventListener('did-stop-loading', stop);
    wv.addEventListener('did-navigate-in-page', upd);
    window.addEventListener('termc-preview-reload', reload);
    return () => {
      wv.removeEventListener('did-start-loading', start);
      wv.removeEventListener('did-stop-loading', stop);
      wv.removeEventListener('did-navigate-in-page', upd);
      window.removeEventListener('termc-preview-reload', reload);
    };
  }, [preview.url]);

  const go = (url) => {
    let u = url.trim();
    if (!u) return;
    if (/^\d+$/.test(u)) u = `http://localhost:${u}`;
    if (!/^https?:\/\//.test(u)) u = `http://${u}`;
    S.setState((s) => ({ preview: { ...s.preview, url: u } }));
  };

  const onResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = preview.width;
    const move = (ev) => S.setState((s) => ({ preview: { ...s.preview, width: Math.min(window.innerWidth - 360, Math.max(280, start - (ev.clientX - startX))) } }));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing', 'resizing-row');
    };
    document.body.classList.add('resizing', 'resizing-row');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <section className={`preview ${shown ? 'shown' : ''}`} style={{ width: shown ? preview.width : 0 }}>
      <div className="preview-inner" style={{ width: preview.width }}>
      <div className="preview-resize" onMouseDown={onResize} />
      <div className="preview-bar">
        <button className="icon-btn" disabled={!nav.back} onClick={() => view.current?.goBack()}><Icon name="arrowLeft" size={14} /></button>
        <button className="icon-btn" disabled={!nav.fwd} onClick={() => view.current?.goForward()}><Icon name="arrowRight" size={14} /></button>
        <button className="icon-btn" onClick={() => view.current?.reload()} disabled={!preview.url}><Icon name="refresh" size={14} className={loading ? 'spin' : ''} /></button>
        <input className="url" value={input} placeholder="localhost:3000" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go(input)} spellCheck={false} />
        <button className="icon-btn" title="Open in browser" disabled={!preview.url} onClick={() => api.invoke('app:openExternal', preview.url)}><Icon name="external" size={14} /></button>
        <button className="icon-btn" title="DevTools" disabled={!preview.url} onClick={() => view.current?.openDevTools()}><Icon name="cpu" size={14} /></button>
        <button className="icon-btn" title="Close preview" onClick={S.closePreview}><Icon name="x" size={14} /></button>
      </div>
      {servers.length > 0 && (
        <div className="preview-servers">
          {servers.map((s) => (
            <button key={s.key} className={`chip ${preview.url.startsWith(s.url.replace(/\/$/, '')) ? 'active' : ''}`} onClick={() => go(s.url)}>
              <span className="sb-live" /> {s.framework} <span className="dim">:{s.port}</span>
            </button>
          ))}
        </div>
      )}
      {preview.url ? (
        <webview ref={view} key={preview.url} src={preview.url} className="webview" partition="persist:preview" />
      ) : (
        <div className="preview-empty">
          <Icon name="globe" size={28} />
          <p>No dev server detected yet.</p>
          <span>Start one (e.g. <code>npm run dev</code>) and TermC will detect Vite, Next.js, Angular, Nuxt and more — or type a URL above.</span>
        </div>
      )}
      </div>
    </section>
  );
}
