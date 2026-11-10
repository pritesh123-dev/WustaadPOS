import { useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime, money, orderTypeLabel, PAYMENT_MODES, STATUS_LABELS } from '../lib/format';
import { printOrder } from '../print/printer';
import { Modal, PromptModal, useApp } from './ui';

export const statusBadge = (s) => (
  <span className={'badge ' + ({ ready: 'ok', preparing: 'saffron', cancelled: 'danger' }[s] || '')}>{STATUS_LABELS[s] || s}</span>
);

export const CANCEL_REASONS = ['Wrong item entered', 'Customer left', 'Duplicate bill', 'Item not available'];

export default function OrderDetail({ order, onClose, onChanged }) {
  const { settings, toast } = useApp();
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const o = order;

  const setStatus = async (status) => {
    setBusy(true);
    try { onChanged?.(await api.setOrderStatus(o.id, status)); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const reprint = () => printOrder(o, settings, { reprint: true }).catch((e) => toast('Printer: ' + e.message, 'error'));

  return (
    <Modal title={`Token ${o.token_no} · ${o.invoice_no}`} onClose={onClose} wide>
      <div className="row wrap small" style={{ marginBottom: '.75rem' }}>
        {statusBadge(o.status)}
        <span>{orderTypeLabel(o)}</span>
        <span className="muted">· {fmtDateTime(o.created_at)}</span>
        {o.created_by_name && <span className="muted">· by {o.created_by_name}</span>}
        {o.customer_phone && <span>· {o.customer_name ? o.customer_name + ' ' : ''}{o.customer_phone}{o.visit_no ? ` (visit #${o.visit_no})` : ''}</span>}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td>{i.name} {i.is_reward && <span className="badge ok">Reward</span>}</td>
                <td className="num">{i.qty}</td>
                <td className="num">{i.is_reward ? '—' : money(i.price)}</td>
                <td className="num">{i.is_reward ? 'FREE' : money(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals num" style={{ maxWidth: 320, marginLeft: 'auto', marginTop: '.75rem' }}>
        <span className="muted">Subtotal</span><span className="right">{money(o.subtotal)}</span>
        {Number(o.discount) > 0 && <><span className="muted">Discount</span><span className="right">−{money(o.discount)}</span></>}
        <span className="muted">Taxable value</span><span className="right">{money(o.taxable_value)}</span>
        <span className="muted">CGST {Number(o.gst_rate) / 2}%</span><span className="right">{money(o.cgst)}</span>
        <span className="muted">SGST {Number(o.gst_rate) / 2}%</span><span className="right">{money(o.sgst)}</span>
        {Number(o.round_off) !== 0 && <><span className="muted">Round off</span><span className="right">{money(o.round_off)}</span></>}
        <span className="grand">Total</span><span className="grand right">{money(o.total)}</span>
        <span className="muted">Paid by</span><span className="right">{PAYMENT_MODES[o.payment_mode]}</span>
      </div>
      {o.tax_note && <p className="small muted">{o.tax_note}</p>}
      {o.notes && <p className="small"><b>Note:</b> {o.notes}</p>}
      {o.cancel_reason && <p className="small err"><b>Cancelled:</b> {o.cancel_reason}</p>}
      <div className="row wrap" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn" onClick={reprint}>🖨 Reprint bill</button>
        {o.status === 'preparing' && <button className="btn primary" disabled={busy} onClick={() => setStatus('ready')}>Mark ready</button>}
        {o.status === 'ready' && <button className="btn primary" disabled={busy} onClick={() => setStatus('completed')}>Picked up / served</button>}
        {o.status === 'completed' && <button className="btn" disabled={busy} onClick={() => setStatus('ready')}>Move back to ready</button>}
        {o.status !== 'cancelled' && <button className="btn danger" onClick={() => setCancelling(true)}>Cancel bill</button>}
      </div>
      {cancelling && (
        <PromptModal title={`Cancel token ${o.token_no}?`} label="Reason (shown in reports)" confirmText="Cancel bill" danger
                     suggestions={CANCEL_REASONS}
                     onSubmit={async (reason) => onChanged?.(await api.setOrderStatus(o.id, 'cancelled', reason))}
                     onClose={() => setCancelling(false)} />
      )}
    </Modal>
  );
}
