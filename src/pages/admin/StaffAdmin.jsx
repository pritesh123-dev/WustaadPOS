import { useState } from 'react';
import { api } from '../../lib/api';
import { Loading, useApp, useLoad } from '../../components/ui';

export default function StaffAdmin() {
  const { toast, staff: me } = useApp();
  const [list, error, reload] = useLoad(() => api.listStaff(), []);
  const [form, setForm] = useState({ email: '', name: '', role: 'cashier' });
  const [busy, setBusy] = useState(false);

  const update = async (row) => {
    try { await api.updateStaff(row); toast('Saved', 'ok'); reload(); } catch (e) { toast(e.message, 'error', 6000); }
  };
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.addStaff(form.email.trim(), form.name.trim(), form.role); toast('Staff added', 'ok'); setForm({ email: '', name: '', role: 'cashier' }); reload(); }
    catch (err) { toast(err.message, 'error', 8000); }
    finally { setBusy(false); }
  };

  return (
    <div className="page narrow stack">
      <h1 style={{ margin: 0 }}>Staff</h1>
      {error && <div className="err">{error.message}</div>}
      <div className="card">
        {!list ? <Loading /> : (
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.user_id}>
                  <td><b>{s.name}</b>{s.user_id === me.user_id && <span className="muted small"> (you)</span>}</td>
                  <td className="small">{s.email}</td>
                  <td>
                    <select className="input" style={{ minHeight: 36, width: 130 }} value={s.role} onChange={(e) => update({ ...s, role: e.target.value })}>
                      <option value="cashier">Cashier</option><option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <button className={'btn sm ' + (s.active ? '' : 'danger')} onClick={() => update({ ...s, active: !s.active })}>{s.active ? '✓ Active' : 'Switched off'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form className="card stack" onSubmit={add}>
        <h2>Add staff</h2>
        <ol className="small muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>In Supabase go to <b>Authentication → Users → Add user</b>, enter their email and a password, and tick “Auto confirm”.</li>
          <li>Then add them here with the same email.</li>
        </ol>
        <div className="row wrap">
          <input className="input grow" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input grow" placeholder="Name (shown on bills)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select className="input" style={{ width: 140 }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="cashier">Cashier</option><option value="admin">Admin</option>
          </select>
          <button className="btn primary" disabled={busy}>Add</button>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Cashiers can bill, manage orders and see today’s and yesterday’s bills, and can cancel a bill within 15 minutes. Admins can do everything, including reports, menu, rewards and staff.</p>
      </form>
    </div>
  );
}
