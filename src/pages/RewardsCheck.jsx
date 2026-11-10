import { useState } from 'react';
import { api } from '../lib/api';

// Public page where customers check their visits and rewards with their mobile number.
export default function RewardsCheck() {
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setRes(null);
    try { setRes(await api.checkRewards(phone)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="public">
      <div style={{ textAlign: 'center', color: '#fff', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900 }}>Wustaad Rewards</div>
        <div style={{ opacity: .85 }}>Check your visits and free treats</div>
      </div>
      <div className="card stack">
        <form className="row" onSubmit={check}>
          <input className="input grow" inputMode="tel" placeholder="Your mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Mobile number" />
          <button className="btn primary" disabled={busy || !phone.trim()}>{busy ? '…' : 'Check'}</button>
        </form>
        {error && <div className="err">{error}</div>}
        {res && !res.found && (
          <div className="stack">
            <p style={{ margin: 0 }}>We don’t have this number yet. Give it at the counter on your next order and start collecting visits!</p>
            <RuleList rewards={res.rewards} visits={0} />
          </div>
        )}
        {res?.found && (
          <div className="stack">
            <div className="center">
              <div className="muted small">Your visits</div>
              <div style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--green)' }}>{res.visits}</div>
            </div>
            {res.rewards.filter((r) => r.available > 0).map((r) => (
              <div key={r.rule_id} className="reward" style={{ fontSize: '1rem' }}>🎁 <span><b>Free {r.reward_item_name}</b> is waiting for you{r.available > 1 ? ` (×${r.available})` : ''}! Ask at the counter.</span></div>
            ))}
            <RuleList rewards={res.rewards} visits={res.visits} />
          </div>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>One visit is counted per day. We only use your number for rewards.</p>
      </div>
    </div>
  );
}

function RuleList({ rewards, visits }) {
  if (!rewards?.length) return null;
  return (
    <div className="stack">
      {rewards.map((r) => {
        const into = r.repeating ? visits % r.visits_required : Math.min(visits, r.visits_required);
        const pct = Math.round((into / r.visits_required) * 100);
        return (
          <div key={r.rule_id}>
            <div className="row small"><b className="grow">Free {r.reward_item_name}</b><span className="muted">{r.repeating ? 'every' : 'at'} {r.visits_required} visits</span></div>
            <div className="progress" style={{ margin: '.35rem 0' }}><i style={{ width: pct + '%' }} /></div>
            <div className="tiny muted">{r.visits_to_next != null ? `${r.visits_to_next} more visit${r.visits_to_next === 1 ? '' : 's'} to go` : 'Unlocked'}</div>
          </div>
        );
      })}
    </div>
  );
}
