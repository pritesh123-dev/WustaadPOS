import { useState } from 'react';
import { api } from '../../lib/api';
import { addDays, businessDate, fmtDateTime, fmtDay, money, money0, ONLINE_SOURCES, ORDER_TYPES, PAYMENT_MODES } from '../../lib/format';
import OrderDetail, { statusBadge } from '../../components/OrderDetail';
import { downloadFile, Loading, useApp, useLoad } from '../../components/ui';

function presetRange(key, dayStartHour) {
  const today = businessDate(new Date(), dayStartHour);
  const first = today.slice(0, 8) + '01';
  switch (key) {
    case 'yesterday': return [addDays(today, -1), addDays(today, -1)];
    case '7d': return [addDays(today, -6), today];
    case 'month': return [first, today];
    case 'lastmonth': { const end = addDays(first, -1); return [end.slice(0, 8) + '01', end]; }
    default: return [today, today];
  }
}

export default function Reports() {
  const { settings } = useApp();
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => presetRange('today', settings.day_start_hour));
  const choose = (key) => { setPreset(key); if (key !== 'custom') setRange(presetRange(key, settings.day_start_hour)); };
  const [from, to] = range;
  const [report, error, reload, loading] = useLoad(() => api.salesReport(from, to), [from, to]);

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }} className="grow">Sales report</h1>
        <div className="seg">
          {[['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom']].map(([k, l]) => (
            <button key={k} className={preset === k ? 'on' : ''} onClick={() => choose(k)}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="row">
            <input type="date" className="input" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
            <span>to</span>
            <input type="date" className="input" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} />
          </div>
        )}
        <button className="btn" onClick={reload}>↻</button>
      </div>
      {error && <div className="err">{error.message}</div>}
      {!report && loading && <Loading />}
      {report && <ReportBody r={report} from={from} to={to} />}
      <SalesList from={from} to={to} onChanged={reload} />
    </div>
  );
}

function Stat({ k, v, s }) {
  return <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;
}

function BarChart({ data, money: isMoney = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = isMoney ? money0 : (v) => v;
  return (
    <div>
      <div className="bars" role="img" aria-label="Bar chart">
        <span className="tiny muted" style={{ position: 'absolute', top: 0, left: 0 }}>{fmt(max)}</span>
        {data.map((d) => (
          <div className="bar-col" key={d.label}>
            <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
            <div className="tip">{d.tip || `${d.label}: ${fmt(d.value)}`}</div>
          </div>
        ))}
      </div>
      <div className="bar-labels">{data.map((d, i) => <span key={d.label}>{data.length > 16 && i % 2 ? '' : d.short ?? d.label}</span>)}</div>
    </div>
  );
}

function ReportBody({ r, from, to }) {
  const s = r.summary;
  const days = [];
  for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) {
    const hit = r.by_day.find((x) => x.date === d);
    days.push({ label: d, short: fmtDay(d), value: Number(hit?.total || 0), tip: `${fmtDay(d)}: ${money0(hit?.total || 0)} · ${hit?.orders || 0} orders` });
  }
  const hours = r.by_hour.map((h) => Number(h.hour));
  const hourData = [];
  if (hours.length) {
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
      const hit = r.by_hour.find((x) => Number(x.hour) === h);
      const label = `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
      hourData.push({ label, value: Number(hit?.orders || 0), tip: `${label}: ${hit?.orders || 0} orders · ${money0(hit?.total || 0)}` });
    }
  }
  const typeMax = Math.max(1, ...r.by_type.map((x) => Number(x.total)));
  const payMax = Math.max(1, ...r.by_payment.map((x) => Number(x.total)));

  return (
    <div className="stack" style={{ gap: '1rem', marginBottom: '1rem' }}>
      <div className="stats">
        <Stat k="Total sales" v={money0(s.total)} s={`${s.orders} orders`} />
        <Stat k="Average bill" v={money0(s.avg_ticket)} />
        <Stat k="GST collected" v={money(Number(s.cgst) + Number(s.sgst))} s={`CGST ${money(s.cgst)} · SGST ${money(s.sgst)}`} />
        <Stat k="Taxable value" v={money0(s.taxable)} s={Number(s.discount) ? `Discounts ${money0(s.discount)}` : 'No discounts'} />
        <Stat k="Customers" v={s.unique_customers} s={`${r.new_customers} new`} />
        <Stat k="Rewards given" v={r.rewards_redeemed} s="free items" />
        <Stat k="Cancelled" v={r.cancelled.orders} s={money0(r.cancelled.total)} />
      </div>
      <div className="grid2">
        {days.length > 1 && <div className="card"><h3>Sales by day</h3><BarChart data={days} /></div>}
        {hourData.length > 0 && <div className="card"><h3>Orders by hour</h3><BarChart data={hourData} money={false} /></div>}
      </div>
      <div className="grid2">
        <div className="card">
          <h3>By order type</h3>
          <table className="tbl"><tbody>
            {r.by_type.map((x) => (
              <tr key={x.order_type}>
                <td style={{ width: '30%' }}>{ORDER_TYPES[x.order_type]}</td>
                <td><div className="hbar"><i style={{ width: `${(x.total / typeMax) * 100}%` }} /></div></td>
                <td className="num">{x.orders}</td><td className="num">{money0(x.total)}</td>
              </tr>))}
          </tbody></table>
          <h3 style={{ marginTop: '1rem' }}>By payment</h3>
          <table className="tbl"><tbody>
            {r.by_payment.map((x) => (
              <tr key={x.payment_mode}>
                <td style={{ width: '30%' }}>{PAYMENT_MODES[x.payment_mode]}</td>
                <td><div className="hbar"><i style={{ width: `${(x.total / payMax) * 100}%` }} /></div></td>
                <td className="num">{x.orders}</td><td className="num">{money0(x.total)}</td>
              </tr>))}
          </tbody></table>
        </div>
        <div className="card">
          <h3>Top items</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Free</th><th className="num">Sales</th></tr></thead>
              <tbody>
                {r.top_items.map((t) => (
                  <tr key={t.name}><td>{t.name}</td><td className="num">{t.qty}</td><td className="num">{t.free_qty || ''}</td><td className="num">{money0(t.amount)}</td></tr>
                ))}
                {!r.top_items.length && <tr><td colSpan={4} className="muted">No sales in this period</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE = 50;
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function SalesList({ from, to, onChanged }) {
  const { toast } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const filters = { from, to, search, status: status ? [status] : null };
  const [data, error, reload, loading] = useLoad(
    () => api.listOrders({ ...filters, limit: PAGE, offset: page * PAGE }), [from, to, search, status, page]);

  const exportCsv = async () => {
    try {
      const all = await api.listOrders({ ...filters, limit: 5000 });
      const head = ['Invoice', 'Date', 'Token', 'Type', 'Source', 'Table', 'Customer phone', 'Customer name', 'Items', 'Subtotal', 'Discount', 'Taxable', 'GST %', 'CGST', 'SGST', 'Round off', 'Total', 'Payment', 'Status', 'Cancel reason', 'Staff'];
      const rows = all.rows.map((o) => [
        o.invoice_no, fmtDateTime(o.created_at), o.token_no, ORDER_TYPES[o.order_type], ONLINE_SOURCES[o.online_source] || '', o.table_no,
        o.customer_phone, o.customer_name, o.items.map((i) => `${i.qty}x ${i.name}${i.is_reward ? ' (free)' : ''}`).join('; '),
        o.subtotal, o.discount, o.taxable_value, o.gst_rate, o.cgst, o.sgst, o.round_off, o.total,
        PAYMENT_MODES[o.payment_mode], o.status, o.cancel_reason, o.created_by_name]);
      downloadFile(`sales_${from}_to_${to}.csv`, '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
    } catch (e) { toast(e.message, 'error'); }
  };

  const total = data?.total || 0;
  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: '.75rem' }}>
        <h3 className="grow" style={{ margin: 0 }}>All bills <span className="muted small">({total})</span></h3>
        <input className="input" style={{ width: 230 }} placeholder="Search bill no, token, phone, name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select className="input" style={{ width: 150 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All statuses</option><option value="preparing">Preparing</option><option value="ready">Ready</option>
          <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
        </select>
        <button className="btn" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      {error && <div className="err">{error.message}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Bill no</th><th>Time</th><th>Token</th><th>Type</th><th>Customer</th><th>Payment</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>
            {(data?.rows || []).map((o) => (
              <tr key={o.id} className="click" onClick={() => setOpen(o)}>
                <td className="num">{o.invoice_no}</td><td>{fmtDateTime(o.created_at)}</td><td className="num">#{o.token_no}</td>
                <td>{ORDER_TYPES[o.order_type]}{o.online_source ? ` · ${ONLINE_SOURCES[o.online_source]}` : ''}</td>
                <td>{o.customer_name || o.customer_phone || <span className="muted">—</span>}</td>
                <td>{PAYMENT_MODES[o.payment_mode]}</td><td className="num">{money(o.total)}</td><td>{statusBadge(o.status)}</td>
              </tr>
            ))}
            {!loading && !data?.rows?.length && <tr><td colSpan={8} className="muted">No bills found</td></tr>}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '.75rem' }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
          <span className="small muted">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next ›</button>
        </div>
      )}
      {open && <OrderDetail order={open} onClose={() => setOpen(null)} onChanged={(o) => { setOpen(o); reload(); onChanged?.(); }} />}
    </div>
  );
}
