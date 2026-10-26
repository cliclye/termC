import * as S from '../store';
import Icon from './Icon';

export default function Toasts() {
  const toasts = S.useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`}>
          <Icon name={t.kind === 'error' ? 'x' : t.kind === 'success' ? 'check' : 'bolt'} size={14} className="toast-icon" />
          <div className="toast-text">
            {t.title && <strong>{t.title}</strong>}
            <span>{t.message}</span>
          </div>
          {t.actions.map((a) => (
            <button key={a.label} className="btn sm" onClick={() => { a.run(); S.dismissToast(t.id); }}>{a.label}</button>
          ))}
          <button className="icon-btn" onClick={() => S.dismissToast(t.id)}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
