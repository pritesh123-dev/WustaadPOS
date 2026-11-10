import { useState } from 'react';
import { api } from '../../lib/api';
import { Loading, Modal, useApp, useLoad } from '../../components/ui';

export default function RewardsAdmin() {
  const { toast } = useApp();
  const [data, error, reload] = useLoad(async () => {
    const [rules, menu] = await Promise.all([api.listRewardRules(), api.getMenu()]);
    return { rules, items: menu.items };
  }, []);
  const [edit, setEdit] = useState(null);

  if (error) return <div className="page"><div className="err">{error.message}</div></div>;
  if (!data) return <Loading />;
  const itemName = (id) => data.items.find((i) => i.id === id)?.name || '?';
  const run = async (fn, ok) => { try { await fn(); toast(ok, 'ok'); reload(); return true; } catch (e) { toast(e.message, 'error', 6000); return false; } };

  return (
    <div className="page narrow stack">
      <div className="row">
        <h1 className="grow" style={{ margin: 0 }}>Rewards</h1>
        <button className="btn primary" onClick={() => setEdit({ name: '', visits_required: 5, reward_item_id: data.items[0]?.id, reward_qty: 1, repeating: true, active: true })}>+ Reward rule</button>
      </div>
      <div className="card small muted">
        How it works: when a customer gives their mobile number, each bill counts as a visit (one visit per day).
        When they reach the visit count of a rule, the billing screen shows <b>Give free</b> and the item goes on the bill at ₹0.
        Customers can see their progress on the bill and at <a href="#/rewards">#/rewards</a>.
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Rule</th><th>Visits</th><th>Free item</th><th>Repeats</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.rules.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td>
                <td className="num">{r.visits_required}</td>
                <td>{r.reward_qty > 1 ? `${r.reward_qty} × ` : ''}{itemName(r.reward_item_id)}</td>
                <td>{r.repeating ? `Every ${r.visits_required} visits` : 'Once'}</td>
                <td>
                  <button className={'btn sm ' + (r.active ? '' : 'danger')} onClick={() => run(() => api.saveRewardRule({ id: r.id, active: !r.active }), r.active ? 'Switched off' : 'Switched on')}>
                    {r.active ? '✓ On' : 'Off'}
                  </button>
                </td>
                <td className="right"><button className="btn sm ghost" onClick={() => setEdit(r)}>Edit</button></td>
              </tr>
            ))}
            {!data.rules.length && <tr><td colSpan={6} className="muted">No reward rules yet</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <RuleForm rule={edit} items={data.items} onClose={() => setEdit(null)}
        onSave={(r) => run(() => api.saveRewardRule(r), 'Saved').then((ok) => ok && setEdit(null))}
        onDelete={edit.id && (() => { if (confirm('Delete this rule?')) run(() => api.deleteRewardRule(edit.id), 'Deleted').then((ok) => ok && setEdit(null)); })} />}
    </div>
  );
}

function RuleForm({ rule, items, onSave, onDelete, onClose }) {
  const [v, setV] = useState(rule);
  const name = (id) => items.find((i) => i.id === Number(id))?.name || '';
  const autoName = `${v.repeating ? 'Every' : 'After'} ${v.visits_required} visits: free ${name(v.reward_item_id)}`;
  const submit = (e) => {
    e.preventDefault();
    onSave({ ...v, name: v.name.trim() || autoName, visits_required: Number(v.visits_required), reward_qty: Number(v.reward_qty) || 1, reward_item_id: Number(v.reward_item_id) });
  };
  const valid = Number(v.visits_required) >= 1 && v.reward_item_id;
  return (
    <Modal title={rule.id ? 'Edit reward rule' : 'New reward rule'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <label className="field" style={{ width: 140 }}>Visits needed<input className="input" inputMode="numeric" value={v.visits_required} onChange={(e) => setV({ ...v, visits_required: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="field grow">Free item
            <select className="input" value={v.reward_item_id ?? ''} onChange={(e) => setV({ ...v, reward_item_id: e.target.value })}>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ width: 80 }}>Qty<input className="input" inputMode="numeric" value={v.reward_qty} onChange={(e) => setV({ ...v, reward_qty: e.target.value.replace(/\D/g, '') })} /></label>
        </div>
        <label className="field">Name shown to staff & customers<input className="input" placeholder={autoName} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={v.repeating} onChange={(e) => setV({ ...v, repeating: e.target.checked })} />Repeat (every {v.visits_required || 'N'} visits, not just once)</label>
        <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Rule is on</label>
        <p className="tiny muted" style={{ margin: 0 }}>Changing the visit count applies to everyone’s existing visits too.</p>
        <div className="row">
          {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
