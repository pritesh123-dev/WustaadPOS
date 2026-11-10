import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { cache, enqueue, isNetworkError, nextOfflineToken } from '../lib/offline';
import {
  computeTotals, isAggregator, money, normalizePhone, nextRewardText, ONLINE_SOURCES, round2, uuid,
} from '../lib/format';
import { getPrinterConfig, printOrder } from '../print/printer';
import { Modal, Seg, VegDot, useApp } from '../components/ui';

const AGGREGATOR_NOTE = 'GST on this order is paid by the delivery platform (Sec 9(5) CGST Act)';

export default function POS() {
  const { settings, staff, toast } = useApp();
  const [menu, setMenu] = useState(() => cache.get('menu', { categories: [], items: [] }));
  const [menuError, setMenuError] = useState('');
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);                 // [{ item_id, qty }]
  const [orderType, setOrderType] = useState('dine_in');
  const [tableNo, setTableNo] = useState('');
  const [source, setSource] = useState('swiggy');
  const [phone, setPhone] = useState('');
  const [custName, setCustName] = useState('');
  const [customer, setCustomer] = useState(null);       // result of lookup_customer
  const [lookup, setLookup] = useState('');             // '' | 'loading' | 'offline' | error text
  const [redeem, setRedeem] = useState([]);             // reward rule ids to give free
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState('cash');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(null);               // { order, provisional }

  const loadMenu = () =>
    api.getMenu()
      .then((m) => { setMenu(m); cache.set('menu', m); setMenuError(''); })
      .catch((e) => { if (!cache.get('menu')?.items?.length) setMenuError(e.message); });
  useEffect(() => { loadMenu(); }, []);

  const itemsById = useMemo(() => Object.fromEntries(menu.items.map((i) => [i.id, i])), [menu]);
  const activeCats = menu.categories.filter((c) => c.active);
  const activeCatIds = new Set(activeCats.map((c) => c.id));
  const visible = menu.items.filter((i) =>
    (i.category_id == null || activeCatIds.has(i.category_id)) &&
    (cat === 'all' || i.category_id === cat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase())));
  const qtyOf = (id) => cart.find((l) => l.item_id === id)?.qty || 0;

  const add = (item) => {
    if (!item.available) return;
    setCart((c) => (c.some((l) => l.item_id === item.id)
      ? c.map((l) => (l.item_id === item.id ? { ...l, qty: l.qty + 1 } : l))
      : [...c, { item_id: item.id, qty: 1 }]));
  };
  const setQty = (id, qty) => setCart((c) => (qty <= 0 ? c.filter((l) => l.item_id !== id) : c.map((l) => (l.item_id === id ? { ...l, qty } : l))));

  // Look the customer up as soon as a full mobile number is typed
  useEffect(() => {
    setCustomer(null);
    setRedeem([]);
    let p;
    try { p = normalizePhone(phone); } catch { setLookup(''); return; }
    if (!p) { setLookup(''); return; }
    if (!navigator.onLine) { setLookup('offline'); return; }
    let alive = true;
    setLookup('loading');
    const t = setTimeout(async () => {
      try {
        const c = await api.lookupCustomer(p);
        if (!alive) return;
        setCustomer(c);
        setLookup('');
        if (c.name) setCustName((n) => n || c.name);
      } catch (e) {
        if (alive) setLookup(isNetworkError(e) ? 'offline' : e.message);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [phone]);

  const changeType = (t) => {
    setOrderType(t);
    if (t === 'online') setPayment('online');
    else if (payment === 'online') setPayment('cash');
  };

  const aggregator = isAggregator(orderType, source);
  const rate = aggregator ? 0 : Number(settings.gst_rate);
  const subtotal = cart.reduce((a, l) => a + (itemsById[l.item_id]?.price || 0) * l.qty, 0);
  const totals = computeTotals(subtotal, { rate, inclusive: settings.prices_include_gst, discount: Number(discount) || 0 });
  const rewardsReady = (customer?.rewards || []).filter((r) => r.available > 0);
  const redeemCount = (ruleId) => redeem.filter((x) => x === ruleId).length;
  const lineCount = cart.length + redeem.length;

  const reset = () => {
    setCart([]); setRedeem([]); setPhone(''); setCustName(''); setCustomer(null);
    setDiscount(''); setNotes(''); setTableNo(''); setSearch('');
    if (orderType === 'online') setPayment('online'); else setPayment('cash');
  };

  const finish = (order, provisional) => {
    setDone({ order, provisional });
    reset();
    if (getPrinterConfig().autoPrint) {
      printOrder(order, settings, { provisional }).catch((e) => toast('Printer: ' + e.message, 'error', 6000));
    }
  };

  function provisionalOrder(p) {
    const items = p.items.map((l) => {
      const m = itemsById[l.item_id];
      return { name: m.name, price: m.price, qty: l.qty, line_total: round2(m.price * l.qty), is_reward: false };
    });
    const t = computeTotals(items.reduce((a, i) => a + i.line_total, 0), { rate, inclusive: settings.prices_include_gst, discount: p.discount });
    return {
      ...t, id: p.client_ref, invoice_no: null, token_no: p.offline_token, order_type: p.order_type,
      table_no: p.table_no, online_source: p.online_source, customer_phone: p.customer_phone, customer_name: p.customer_name,
      payment_mode: p.payment_mode, gst_rate: rate, tax_note: aggregator ? AGGREGATOR_NOTE : null, notes: p.notes,
      created_at: p.created_at, created_by_name: staff.name, items, status: 'preparing', loyalty: null,
    };
  }

  const place = async () => {
    if (!lineCount || placing) return;
    let phoneNorm;
    try { phoneNorm = normalizePhone(phone); } catch (e) { toast(e.message, 'error'); return; }
    const payload = {
      client_ref: uuid(),
      order_type: orderType,
      table_no: orderType === 'dine_in' ? tableNo.trim() || null : null,
      online_source: orderType === 'online' ? source : null,
      customer_phone: phoneNorm,
      customer_name: custName.trim() || null,
      payment_mode: payment,
      discount: Number(discount) || 0,
      notes: notes.trim() || null,
      items: cart,
      redeem_rule_ids: redeem,
    };
    setPlacing(true);
    try {
      finish(await api.placeOrder(payload), false);
    } catch (e) {
      if (!isNetworkError(e)) { toast(e.message, 'error', 6000); return; }
      if (redeem.length) { toast('No internet: free reward items can’t be given right now. Remove them to bill offline.', 'error', 7000); return; }
      if (!cart.length) return;
      const offlinePayload = { ...payload, offline_token: nextOfflineToken(settings.day_start_hour), created_at: new Date().toISOString(), redeem_rule_ids: [] };
      enqueue(offlinePayload);
      finish(provisionalOrder(offlinePayload), true);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="pos" style={{ flex: 1, minHeight: 0 }}>
      {/* ---------------- menu ---------------- */}
      <section className="menu-pane">
        <div className="row">
          <input className="input grow" placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" onClick={loadMenu} title="Reload menu">↻</button>
        </div>
        <div className="cats">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
          {activeCats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
        {menuError && <div className="err">Couldn’t load the menu: {menuError}</div>}
        <div className="items">
          {visible.map((i) => (
            <button key={i.id} className={'tile' + (i.available ? '' : ' off')} onClick={() => add(i)} disabled={!i.available}>
              <span className="nm"><VegDot veg={i.is_veg} />{i.name}</span>
              <span className="pr num">{i.available ? money(i.price) : 'Sold out'}</span>
              {qtyOf(i.id) > 0 && <span className="qty">{qtyOf(i.id)}</span>}
            </button>
          ))}
          {!visible.length && !menuError && <div className="empty" style={{ gridColumn: '1/-1' }}>No items. Add some in Admin → Menu.</div>}
        </div>
      </section>

      {/* ---------------- cart ---------------- */}
      <aside className="cart">
        <div className="cart-scroll">
          <Seg value={orderType} onChange={changeType} options={[['dine_in', 'Dine-in'], ['takeaway', 'Takeaway'], ['online', 'Online']]} />
          {orderType === 'dine_in' && (
            <input className="input" placeholder="Table no. (optional)" value={tableNo} onChange={(e) => setTableNo(e.target.value)} />
          )}
          {orderType === 'online' && (
            <div className="stack" style={{ gap: '.35rem' }}>
              <Seg value={source} onChange={setSource} options={Object.entries(ONLINE_SOURCES).filter(([k]) => k !== 'other')} />
              {aggregator && <div className="tiny muted">No GST added: {ONLINE_SOURCES[source]} pays GST on its orders.</div>}
            </div>
          )}

          <div className="cust">
            <div className="row">
              <input className="input grow" inputMode="tel" placeholder="Customer mobile (for rewards)" value={phone}
                     onChange={(e) => setPhone(e.target.value)} aria-label="Customer mobile number" />
              {phone && <button className="btn ghost sm" onClick={() => { setPhone(''); setCustName(''); }}>✕</button>}
            </div>
            {lookup === 'loading' && <div className="small muted" style={{ marginTop: '.4rem' }}>Checking…</div>}
            {lookup === 'offline' && <div className="small muted" style={{ marginTop: '.4rem' }}>Offline: rewards can’t be checked. The visit will still be counted when the bill syncs.</div>}
            {lookup && !['loading', 'offline'].includes(lookup) && <div className="err small" style={{ marginTop: '.4rem' }}>{lookup}</div>}
            {customer && (
              <div style={{ marginTop: '.5rem' }}>
                <input className="input" placeholder="Name (optional)" value={custName} onChange={(e) => setCustName(e.target.value)} />
                <div className="row wrap small" style={{ marginTop: '.45rem' }}>
                  {customer.found ? <span className="badge ok">Returning customer</span> : <span className="badge saffron">New customer</span>}
                  <span>
                    {customer.visit_counts_today
                      ? <>This is visit <b>#{customer.visit_no}</b></>
                      : <>Visit #{customer.visit_no} already counted today</>}
                  </span>
                </div>
                {rewardsReady.map((r) => {
                  const used = redeemCount(r.rule_id);
                  return (
                    <div className="reward" key={r.rule_id}>
                      <span>🎁</span>
                      <span className="grow"><b>Free {r.reward_item_name}</b>{r.reward_qty > 1 ? ` ×${r.reward_qty}` : ''}<br /><span className="tiny muted">{r.name}{r.available > 1 ? ` · ${r.available} available` : ''}</span></span>
                      {used > 0 && <button className="btn sm" onClick={() => setRedeem((x) => { const i = x.indexOf(r.rule_id); return x.filter((_, j) => j !== i); })}>Remove</button>}
                      {used < r.available && <button className="btn sm accent" onClick={() => setRedeem((x) => [...x, r.rule_id])}>Give free</button>}
                    </div>
                  );
                })}
                {!rewardsReady.length && nextRewardText(customer.rewards) && (
                  <div className="tiny muted" style={{ marginTop: '.4rem' }}>After this: {nextRewardText(customer.rewards)}</div>
                )}
              </div>
            )}
          </div>

          <div className="lines">
            {cart.map((l) => {
              const m = itemsById[l.item_id];
              if (!m) return null;
              return (
                <div className="line" key={l.item_id}>
                  <div><div className="nm"><VegDot veg={m.is_veg} />{m.name}</div><div className="tiny muted num">{money(m.price)}</div></div>
                  <div className="stepper">
                    <button onClick={() => setQty(l.item_id, l.qty - 1)} aria-label={'Less ' + m.name}>−</button>
                    <span className="num">{l.qty}</span>
                    <button onClick={() => setQty(l.item_id, l.qty + 1)} aria-label={'More ' + m.name}>+</button>
                  </div>
                  <div className="right num" style={{ fontWeight: 700 }}>{money(m.price * l.qty)}</div>
                </div>
              );
            })}
            {redeem.map((ruleId, idx) => {
              const r = customer?.rewards.find((x) => x.rule_id === ruleId);
              return (
                <div className="line" key={'r' + idx}>
                  <div><div className="nm">🎁 {r?.reward_item_name}</div><div className="tiny muted">Reward</div></div>
                  <div className="num">×{r?.reward_qty}</div>
                  <div className="right"><span className="badge ok">FREE</span></div>
                </div>
              );
            })}
            {!lineCount && <div className="empty">Tap items to add them</div>}
          </div>
          {lineCount > 0 && (
            <input className="input" placeholder="Kitchen note (e.g. less spicy)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </div>

        <div className="cart-foot">
          <div className="totals num">
            <span className="muted">Subtotal</span><span className="right">{money(totals.subtotal)}</span>
            <span className="muted row" style={{ gap: '.4rem' }}>Discount ₹
              <input className="input" style={{ minHeight: 32, width: 80, padding: '.2rem .4rem' }} inputMode="decimal"
                     value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" aria-label="Discount in rupees" />
            </span>
            <span className="right">{totals.discount ? '−' + money(totals.discount) : '—'}</span>
            {rate > 0 && <><span className="muted">CGST {rate / 2}% + SGST {rate / 2}%</span><span className="right">{money(totals.cgst + totals.sgst)}</span></>}
            {totals.round_off !== 0 && <><span className="muted">Round off</span><span className="right">{money(totals.round_off)}</span></>}
            <span className="grand">Total</span><span className="grand right">{money(totals.total)}</span>
          </div>
          <Seg value={payment} onChange={setPayment}
               options={orderType === 'online' ? [['online', 'Paid online'], ['cash', 'Cash'], ['upi', 'UPI']] : [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']]} />
          <div className="row">
            <button className="btn" onClick={reset} disabled={!lineCount && !phone}>Clear</button>
            <button className="btn primary lg grow" onClick={place} disabled={!lineCount || placing}>
              {placing ? 'Saving…' : `Place order · ${money(totals.total)}`}
            </button>
          </div>
        </div>
      </aside>

      {done && <DoneModal {...done} settings={settings} onClose={() => setDone(null)} />}
    </div>
  );
}

function DoneModal({ order, provisional, settings, onClose }) {
  const { toast } = useApp();
  const print = (opts) => printOrder(order, settings, { provisional, ...opts }).catch((e) => toast('Printer: ' + e.message, 'error'));
  return (
    <Modal onClose={onClose}>
      <div className="stack center">
        <div className="muted">Order placed{provisional ? ' (saved offline)' : ''}</div>
        <div className="small muted">TOKEN</div>
        <div className="token-big">{order.token_no}</div>
        <div className="num" style={{ fontSize: '1.3rem', fontWeight: 800 }}>{money(order.total)}</div>
        <div className="small muted">{order.invoice_no || 'Bill number will be given when the tablet is back online'}</div>
        {order.loyalty && <div className="badge saffron" style={{ alignSelf: 'center' }}>Visit #{order.loyalty.visits}{nextRewardText(order.loyalty.rewards) ? ' · ' + nextRewardText(order.loyalty.rewards) : ''}</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: '.5rem' }}>
          <button className="btn" onClick={() => print({ withKot: false })}>🖨 Print bill</button>
          <button className="btn" onClick={() => print({ kotOnly: true })}>Print KOT</button>
          <button className="btn primary" autoFocus onClick={onClose}>New order</button>
        </div>
      </div>
    </Modal>
  );
}
