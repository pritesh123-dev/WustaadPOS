import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// ---------- toasts ----------
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, kind = 'info', ms = 3500) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg: String(msg?.message || msg), kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const view = (
    <div className="toasts" role="status">
      {toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}
    </div>
  );
  return [toast, view];
}

// ---------- modal ----------
export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className="row" style={{ marginBottom: '.75rem' }}>
            <h2 className="grow" style={{ margin: 0 }}>{title}</h2>
            {onClose && <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>}
          </div>
        )}
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>{footer}</div>}
      </div>
    </div>
  );
}

// Ask for a line of text (e.g. cancel reason). Returns a promise-like via callbacks.
export function PromptModal({ title, label, placeholder, confirmText = 'OK', danger, onSubmit, onClose, suggestions = [] }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit(value); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">{label}
          <input ref={ref} className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        </label>
        {suggestions.length > 0 && (
          <div className="row wrap">
            {suggestions.map((s) => <button type="button" key={s} className="btn sm" onClick={() => setValue(s)}>{s}</button>)}
          </div>
        )}
        {error && <div className="err">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy || !value.trim()}>{busy ? 'Please wait…' : confirmText}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export const VegDot = ({ veg }) => <span className={'dot' + (veg ? '' : ' nv')} title={veg ? 'Veg' : 'Non-veg'} />;

export function Loading({ text = 'Loading…' }) {
  return <div className="empty">{text}</div>;
}

// Re-run a loader when deps change; returns [data, error, reload, loading]
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loader();
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return [state.data, state.error, reload, state.loading];
}

export function downloadFile(name, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
