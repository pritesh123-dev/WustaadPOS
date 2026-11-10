import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Customer-facing "who is next" screen. Open #/display on a TV or spare tablet — no login needed.
export default function Display() {
  const [q, setQ] = useState({ shop_name: '', preparing: [], ready: [] });
  const [error, setError] = useState(false);
  const [now, setNow] = useState(new Date());
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState(new Set());
  const prevReady = useRef(null);
  const audio = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.getQueue();
        if (!alive) return;
        setQ(data); setError(false);
        const before = prevReady.current;
        if (before) {
          const added = data.ready.filter((t) => !before.includes(t));
          if (added.length) { setFresh(new Set(added)); chime(); }
        }
        prevReady.current = data.ready;
      } catch { if (alive) setError(true); }
    };
    load();
    const poll = setInterval(load, 4000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chime() {
    const ctx = audio.current;
    if (!ctx) return;
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.start(t); o.stop(t + 0.55);
    });
  }
  const enableSound = () => {
    audio.current = new (window.AudioContext || window.webkitAudioContext)();
    setSound(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="display">
      <header>
        <h1>{q.shop_name || 'Wustaad'}</h1>
        {error && <span className="badge warn">Reconnecting…</span>}
        {!sound && <button className="btn sm" onClick={enableSound}>🔔 Tap for sound + full screen</button>}
        <div className="clock">{now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</div>
      </header>
      <div className="qcols">
        <section className="qcol">
          <h2>Preparing</h2>
          <div className="tokens">{q.preparing.map((t) => <div className="tok" key={t}>{t}</div>)}</div>
          {!q.preparing.length && <div style={{ opacity: .5 }}>—</div>}
        </section>
        <section className="qcol ready">
          <h2>Ready — please collect</h2>
          <div className="tokens">{q.ready.map((t) => <div className={'tok' + (fresh.has(t) ? ' new' : '')} key={t}>{t}</div>)}</div>
          {!q.ready.length && <div style={{ opacity: .5 }}>—</div>}
        </section>
      </div>
      <div style={{ opacity: .6, textAlign: 'center' }}>Check your visits & rewards: open this site and go to <b>#/rewards</b></div>
    </div>
  );
}
