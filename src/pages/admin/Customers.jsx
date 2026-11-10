import { useState } from 'react';
import { api } from '../../lib/api';
import { fmtDay, money0, nextRewardText } from '../../lib/format';
import { Modal, useApp, useLoad } from '../../components/ui';

const PAGE = 50;

export default function Customers() {
  const { toast } = useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const [data, error, reload, loading] = useLoad(() => api.listCustomers({ search, limit: PAGE, offset: page * PAGE }), [search, page]);
  const total = data?.total || 0;

  return (
    <div className="page narrow stack">
      <div className="row">
        <h1 className="grow" style={{ margin: 0 }}>Customers <span className="muted small">({total})</span></h1>
        <input className="input" style={{ width: 240 }} placeholder="Search mobile or name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>
      {error && <div className="err">{error.message}</div>}
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Mobile</th><th>Name</th><th className="num">Visits</th><th className="num">Spent</th><th>Last visit</th></tr></thead>
          <tbody>
            {(data?.rows || []).map((c) => (
              <tr key={c.phone} className="click" onClick={() => setOpen(c)}>
                <td className="num">{c.phone}</td><td>{c.name || <span className="muted">—</span>}</td>
                <td className="num">{c.visits}</td><td className="num">{money0(c.total_spent)}</td>
                <td>{c.last_visit_date ? fmtDay(c.last_visit_date) : '—'}</td>
              </tr>
            ))}
            {!loading && !data?.rows?.length && <tr><td colSpan={5} className="muted">No customers yet. They’re added when a mobile number is entered on a bill.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
          <span className="small muted">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next ›</button>
        </div>
      )}
      {open && <CustomerModal c={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} toast={toast} />}
    </div>
  );
}

function CustomerModal({ c, onClose, onChanged, toast }) {
  const [name, setName] = useState(c.name || '');
  const [rewards] = useLoad(() => api.checkRewards(c.phone), [c.phone]);
  const save = async () => { try { await api.updateCustomer(c.phone, name); toast('Saved', 'ok'); onChanged(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async () => {
    if (!confirm(`Delete ${c.phone}? Their visits and rewards are removed. Past bills stay, without the number.`)) return;
    try { await api.deleteCustomer(c.phone); toast('Customer deleted', 'ok'); onChanged(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={c.phone} onClose={onClose}>
      <div className="stack">
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="stats">
          <div className="stat"><div className="k">Visits</div><div className="v">{c.visits}</div></div>
          <div className="stat"><div className="k">Total spent</div><div className="v">{money0(c.total_spent)}</div></div>
        </div>
        {rewards && (
          <div className="small">
            {rewards.rewards.filter((r) => r.available > 0).map((r) => <div key={r.rule_id} className="reward">🎁 Free {r.reward_item_name} ready ({r.available})</div>)}
            {nextRewardText(rewards.rewards) && <div className="muted" style={{ marginTop: '.4rem' }}>{nextRewardText(rewards.rewards)}</div>}
          </div>
        )}
        <div className="row">
          <button className="btn danger" onClick={remove}>Delete customer</button>
          <span className="spacer" />
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
