import { useState } from 'react';
import { api, DEMO } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState(DEMO ? 'owner@demo.in' : '');
  const [password, setPassword] = useState(DEMO ? 'demo' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.signIn(email.trim(), password); }
    catch (err) { setError(/invalid login/i.test(err.message) ? 'Wrong email or password' : err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="public">
      <div style={{ textAlign: 'center', color: '#fff', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900 }}>Wustaad POS</div>
        <div style={{ opacity: .8 }}>Staff login</div>
      </div>
      <form className="card stack" onSubmit={submit}>
        <label className="field">Email
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">Password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="err">{error}</div>}
        <button className="btn primary lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        {DEMO && <div className="muted small">Demo: owner@demo.in (admin) or cashier@demo.in (cashier), any password.</div>}
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <a href="#/display">Token screen</a>
          <a href="#/rewards">Customer rewards page</a>
        </div>
      </form>
    </div>
  );
}
