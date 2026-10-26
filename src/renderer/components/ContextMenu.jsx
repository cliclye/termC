import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as S from '../store';

export default function ContextMenu() {
  const menu = S.useStore((s) => s.contextMenu);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => !ref.current?.contains(e.target) && S.setState({ contextMenu: null });
    const esc = (e) => e.key === 'Escape' && S.setState({ contextMenu: null });
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', () => S.setState({ contextMenu: null }), { once: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (!menu) return null;
  const run = (fn, arg) => {
    S.setState({ contextMenu: null });
    Promise.resolve(fn(arg)).catch((e) => S.toast(e.message, { kind: 'error' }));
  };
  return (
    <div ref={ref} className="context-menu" style={{ left: (pos || menu).x, top: (pos || menu).y, visibility: pos ? 'visible' : 'hidden' }}>
      {menu.items.map((it, i) =>
        it.type === 'sep' ? (
          <div key={i} className="cm-sep" />
        ) : it.type === 'colors' ? (
          <div key={i} className="cm-colors">
            {it.colors.map((c) => (
              <button key={c} className={`swatch sm ${c === it.value ? 'on' : ''}`} style={{ background: c }} onClick={() => run(it.run, c)} />
            ))}
          </div>
        ) : (
          <button key={i} className={`cm-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} onClick={() => run(it.run)}>
            <span>{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
