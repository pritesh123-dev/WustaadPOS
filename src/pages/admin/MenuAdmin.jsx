import { useState } from 'react';
import { api } from '../../lib/api';
import { cache } from '../../lib/offline';
import { money } from '../../lib/format';
import { Loading, Modal, useApp, useLoad, VegDot } from '../../components/ui';

export default function MenuAdmin() {
  const { toast, settings } = useApp();
  const [menu, error, reload] = useLoad(async () => { const m = await api.getMenu(); cache.set('menu', m); return m; }, []);
  const [editItem, setEditItem] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [filter, setFilter] = useState('');

  if (error) return <div className="page"><div className="err">{error.message}</div></div>;
  if (!menu) return <Loading />;

  const run = async (fn, ok) => {
    try { await fn(); if (ok) toast(ok, 'ok'); reload(); return true; } catch (e) {
      toast(/foreign key/i.test(e.message) ? 'This is used by a reward rule. Change the rule first, or mark it sold out instead.' : e.message, 'error', 6000);
      return false;
    }
  };
  const catName = (id) => menu.categories.find((c) => c.id === id)?.name || 'No category';
  const groups = [...menu.categories.map((c) => c.id), null];
  const f = filter.toLowerCase();

  return (
    <div className="page narrow stack">
      <div className="row wrap">
        <h1 className="grow" style={{ margin: 0 }}>Menu</h1>
        <input className="input" style={{ width: 220 }} placeholder="Find item" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn" onClick={() => setEditCat({ name: '', sort: menu.categories.length + 1, active: true })}>+ Category</button>
        <button className="btn primary" onClick={() => setEditItem({ name: '', price: '', category_id: menu.categories[0]?.id ?? null, is_veg: false, available: true, sort: 0 })}>+ Item</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Tap “Available” to mark an item sold out for the day — it greys out on the billing screen. Prices are {settings.prices_include_gst ? 'including' : 'before'} GST (change in Settings).</p>

      {groups.map((cid) => {
        const items = menu.items.filter((i) => (i.category_id ?? null) === cid && (!f || i.name.toLowerCase().includes(f)));
        const c = menu.categories.find((x) => x.id === cid);
        if (cid === null && !items.length) return null;
        return (
          <div className="card" key={String(cid)}>
            <div className="row" style={{ marginBottom: '.5rem' }}>
              <h2 className="grow" style={{ margin: 0 }}>{catName(cid)} {c && !c.active && <span className="badge">Hidden</span>}</h2>
              {c && <button className="btn sm" onClick={() => setEditCat(c)}>Edit category</button>}
            </div>
            <table className="tbl">
              <thead><tr><th>Item</th><th className="num">Price</th><th>Available</th><th /></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><VegDot veg={i.is_veg} />{i.name}</td>
                    <td className="num">{money(i.price)}</td>
                    <td>
                      <button className={'btn sm ' + (i.available ? '' : 'danger')} onClick={() => run(() => api.saveMenuItem({ id: i.id, available: !i.available }))}>
                        {i.available ? '✓ Available' : 'Sold out'}
                      </button>
                    </td>
                    <td className="right"><button className="btn sm ghost" onClick={() => setEditItem(i)}>Edit</button></td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={4} className="muted">No items</td></tr>}
              </tbody>
            </table>
          </div>
        );
      })}

      {editItem && (
        <ItemForm item={editItem} categories={menu.categories} onClose={() => setEditItem(null)}
          onSave={(it) => run(() => api.saveMenuItem(it), 'Saved').then((ok) => ok && setEditItem(null))}
          onDelete={editItem.id && (() => { if (confirm(`Delete ${editItem.name}? Old bills keep their copy of the item.`)) run(() => api.deleteMenuItem(editItem.id), 'Deleted').then((ok) => ok && setEditItem(null)); })} />
      )}
      {editCat && (
        <CategoryForm cat={editCat} onClose={() => setEditCat(null)}
          onSave={(c) => run(() => api.saveCategory(c), 'Saved').then((ok) => ok && setEditCat(null))}
          onDelete={editCat.id && (() => { if (confirm(`Delete category ${editCat.name}? Its items move to “No category”.`)) run(() => api.deleteCategory(editCat.id), 'Deleted').then((ok) => ok && setEditCat(null)); })} />
      )}
    </div>
  );
}

function ItemForm({ item, categories, onSave, onDelete, onClose }) {
  const [v, setV] = useState({ ...item, price: String(item.price ?? '') });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valid = v.name.trim() && v.price !== '' && Number(v.price) >= 0;
  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ ...v, name: v.name.trim(), price: Number(v.price), sort: Number(v.sort) || 0, category_id: v.category_id === '' || v.category_id == null ? null : Number(v.category_id) });
  };
  return (
    <Modal title={item.id ? 'Edit item' : 'New item'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Name<input className="input" value={v.name} onChange={set('name')} autoFocus /></label>
        <div className="row">
          <label className="field grow">Price (₹)<input className="input" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          <label className="field grow">Category
            <select className="input" value={v.category_id ?? ''} onChange={set('category_id')}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="check grow"><input type="checkbox" checked={v.is_veg} onChange={set('is_veg')} />Vegetarian</label>
          <label className="check grow"><input type="checkbox" checked={v.available} onChange={set('available')} />Available</label>
          <label className="field" style={{ width: 90 }}>Order<input className="input" inputMode="numeric" value={v.sort} onChange={set('sort')} /></label>
        </div>
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

function CategoryForm({ cat, onSave, onDelete, onClose }) {
  const [v, setV] = useState(cat);
  return (
    <Modal title={cat.id ? 'Edit category' : 'New category'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (v.name.trim()) onSave({ ...v, name: v.name.trim(), sort: Number(v.sort) || 0 }); }}>
        <label className="field">Name<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></label>
        <div className="row">
          <label className="field" style={{ width: 120 }}>Order<input className="input" inputMode="numeric" value={v.sort} onChange={(e) => setV({ ...v, sort: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Show on billing screen</label>
        </div>
        <div className="row">
          {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!v.name.trim()}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
