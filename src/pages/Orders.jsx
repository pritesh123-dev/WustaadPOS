import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { discardQueued } from '../lib/offline';
import { fmtTime, minutesSince, money, orderTypeLabel } from '../lib/format';
import { printOrder } from '../print/printer';
import OrderDetail, { statusBadge } from '../components/OrderDetail';
import { useApp } from '../components/ui';

// Live kitchen/counter board: Preparing → Ready → Done. Updates in real time.
export default function Orders() {
  const { toast, queue, runSync, settings } = useApp();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.listOrders({ limit: 300 });
      setOrders(res.rows);
      setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    load();
    const unsub = api.subscribeOrders(load);
    const poll = setInterval(load, 15000);        // safety net if realtime drops
    const clock = setInterval(() => tick((n) => n + 1), 30000);
    return () => { unsub(); clearInterval(poll); clearInterval(clock); };
  }, [load]);

  const replace = (o) => {
    setOrders((list) => list.map((x) => (x.id === o.id ? o : x)));
    setOpen((cur) => (cur && cur.id === o.id ? o : cur));
  };
  const setStatus = async (o, status) => {
    try { replace(await api.setOrderStatus(o.id, status)); } catch (e) { toast(e.message, 'error'); }
  };

  const preparing = orders.filter((o) => o.status === 'preparing').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ready = orders.filter((o) => o.status === 'ready').sort((a, b) => (a.ready_at || '').localeCompare(b.ready_at || ''));
  const done = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));
  const todayTotal = orders.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + Number(o.total), 0);

  const card = (o) => {
    const mins = minutesSince(o.created_at);
    return (
      <div key={o.id} className={'ocard' + (o.status === 'ready' ? ' ready' : '')}>
        <div className="row">
          <div className="tk">#{o.token_no}</div>
          <div className="grow small">
            <b>{orderTypeLabel(o)}</b><br />
            <span className={mins >= 20 && o.status === 'preparing' ? 'late' : 'muted'}>{fmtTime(o.created_at)} · {mins} min ago</span>
          </div>
          <button className="btn sm ghost" onClick={() => setOpen(o)}>Details</button>
        </div>
        <ul>
          {o.items.map((i) => <li key={i.id}><b>{i.qty} ×</b> {i.name}{i.is_reward ? ' (free)' : ''}</li>)}
        </ul>
        {o.notes && <div className="small" style={{ marginBottom: '.4rem' }}>📝 {o.notes}</div>}
        <div className="row">
          <span className="small muted grow">{o.customer_name || ''} {money(o.total)}</span>
          {o.status === 'preparing' && <button className="btn primary" onClick={() => setStatus(o, 'ready')}>Ready ✓</button>}
          {o.status === 'ready' && <>
            <button className="btn sm" onClick={() => setStatus(o, 'preparing')}>Undo</button>
            <button className="btn primary" onClick={() => setStatus(o, 'completed')}>Picked up</button>
          </>}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      {queue.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: '#f3c66b' }}>
          <div className="row"><h3 className="grow" style={{ margin: 0 }}>Waiting to sync ({queue.length})</h3><button className="btn sm" onClick={runSync}>Sync now</button></div>
          {queue.map((q) => (
            <div key={q.payload.client_ref} className="done-row">
              <b>#{q.payload.offline_token}</b>
              <span className="grow muted">{fmtTime(q.payload.created_at)} · {q.payload.items.reduce((a, i) => a + i.qty, 0)} items</span>
              {q.error && <span className="err small">{q.error}</span>}
              {q.error && <button className="btn sm danger" onClick={() => { if (confirm('Delete this unsynced bill?')) discardQueued(q.payload.client_ref); }}>Discard</button>}
            </div>
          ))}
        </div>
      )}
      {error && <div className="err" style={{ marginBottom: '.75rem' }}>{error}</div>}
      <div className="board">
        <section>
          <div className="col-h"><h2 style={{ margin: 0 }}>Preparing</h2><span className="badge saffron">{preparing.length}</span></div>
          {preparing.map(card)}
          {!preparing.length && <div className="empty">No orders in the kitchen</div>}
        </section>
        <section>
          <div className="col-h"><h2 style={{ margin: 0 }}>Ready for pickup</h2><span className="badge ok">{ready.length}</span></div>
          {ready.map(card)}
          {!ready.length && <div className="empty">Nothing waiting</div>}
        </section>
        <section className="card">
          <div className="col-h"><h3 style={{ margin: 0 }} className="grow">Done today</h3><span className="small muted num" title="All bills today except cancelled">Sales {money(todayTotal)}</span></div>
          {done.slice(0, 60).map((o) => (
            <div key={o.id} className="done-row">
              <b className="num">#{o.token_no}</b>
              <span className="grow muted small">{fmtTime(o.created_at)} · {money(o.total)}</span>
              {o.status === 'cancelled' && statusBadge('cancelled')}
              <button className="btn sm ghost" onClick={() => printOrder(o, settings, { reprint: true }).catch((e) => toast(e.message, 'error'))} title="Reprint">🖨</button>
              <button className="btn sm ghost" onClick={() => setOpen(o)}>›</button>
            </div>
          ))}
          {!done.length && <div className="empty small">No finished orders yet</div>}
        </section>
      </div>
      {open && <OrderDetail order={open} onClose={() => setOpen(null)} onChanged={replace} />}
    </div>
  );
}
