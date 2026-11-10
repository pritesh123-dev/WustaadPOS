// Builds the customer bill and the kitchen ticket (KOT) as plain fixed-width lines,
// then turns those lines into ESC/POS bytes (thermal printers) or HTML (browser printing).
import { fmtBillDate, maskPhone, orderTypeLabel, PAYMENT_MODES, nextRewardText } from '../lib/format';

const amt = (n) => Number(n || 0).toFixed(2);

export function toAscii(s) {
  return String(s ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[·•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

function wrap(text, width) {
  const words = toAscii(text).split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (let w of words) {
    while (w.length > width) { // very long word
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

class Doc {
  constructor(width) { this.w = width; this.lines = []; }
  width(big) { return big ? Math.floor(this.w / 2) : this.w; }
  center(text, o = {}) {
    const w = this.width(o.big);
    wrap(text, w).forEach((t) => this.lines.push({ text: ' '.repeat(Math.floor((w - t.length) / 2)) + t, ...o }));
    return this;
  }
  left(text, o = {}) { wrap(text, this.width(o.big)).forEach((t) => this.lines.push({ text: t, ...o })); return this; }
  lr(l, r, o = {}) {
    const w = this.width(o.big);
    l = toAscii(l); r = toAscii(r);
    if (l.length + r.length + 1 <= w) this.lines.push({ text: l + ' '.repeat(w - l.length - r.length) + r, ...o });
    else { this.left(l, o); this.lines.push({ text: r.padStart(w), ...o }); }
    return this;
  }
  hr(ch = '-') { this.lines.push({ text: ch.repeat(this.w) }); return this; }
  blank() { this.lines.push({ text: '' }); return this; }
}

function itemRows(doc, items) {
  const W = doc.w;
  if (W >= 42) {
    const qW = 4, rW = 9, aW = 11, nW = W - qW - rW - aW;
    doc.lines.push({ text: 'Item'.padEnd(nW) + 'Qty'.padStart(qW) + 'Rate'.padStart(rW) + 'Amount'.padStart(aW), bold: true });
    doc.hr();
    for (const it of items) {
      const name = wrap(it.name + (it.is_reward ? ' (REWARD)' : ''), nW - 1);
      const rate = it.is_reward ? '' : amt(it.price);
      const total = it.is_reward ? 'FREE' : amt(it.line_total);
      doc.lines.push({ text: name[0].padEnd(nW) + String(it.qty).padStart(qW) + rate.padStart(rW) + total.padStart(aW) });
      name.slice(1).forEach((n) => doc.lines.push({ text: '  ' + n }));
    }
  } else {
    doc.lines.push({ text: 'Item'.padEnd(W - 8) + 'Amount'.padStart(8), bold: true });
    doc.hr();
    for (const it of items) {
      doc.left(it.name + (it.is_reward ? ' (REWARD)' : ''));
      const l = it.is_reward ? `  ${it.qty} x FREE` : `  ${it.qty} x ${amt(it.price)}`;
      doc.lr(l, it.is_reward ? 'FREE' : amt(it.line_total));
    }
  }
}

export function receiptDoc(order, settings, { width = 48, provisional = false, reprint = false } = {}) {
  const d = new Doc(width);
  const s = settings || {};
  d.center(s.shop_name || 'Wustaad', { big: true, bold: true });
  if (s.tagline) d.center(s.tagline);
  if (s.address) d.center(s.address);
  if (s.phone) d.center('Ph: ' + s.phone);
  if (s.gstin) d.center('GSTIN: ' + s.gstin);
  if (s.fssai) d.center('FSSAI: ' + s.fssai);
  d.hr('=');
  d.center(provisional ? 'BILL (OFFLINE - PROVISIONAL)' : Number(order.gst_rate) > 0 ? 'TAX INVOICE' : 'INVOICE', { bold: true });
  if (reprint) d.center('** DUPLICATE COPY **');
  d.center(`TOKEN ${order.token_no}`, { big: true, bold: true });
  d.center(orderTypeLabel(order).toUpperCase(), { bold: true });
  d.hr();
  d.lr('Bill No: ' + (order.invoice_no || 'Pending sync'), '');
  d.lr('Date: ' + fmtBillDate(order.created_at), order.created_by_name ? 'By: ' + order.created_by_name : '');
  if (order.customer_phone) {
    d.left(`Customer: ${maskPhone(order.customer_phone)}${order.customer_name ? ' (' + order.customer_name + ')' : ''}`);
  }
  d.hr();
  itemRows(d, order.items || []);
  d.hr();
  d.lr('Subtotal', amt(order.subtotal));
  if (Number(order.discount) > 0) d.lr('Discount', '-' + amt(order.discount));
  if (Number(order.gst_rate) > 0) {
    const half = Number(order.gst_rate) / 2;
    d.lr('Taxable value', amt(order.taxable_value));
    d.lr(`CGST @ ${half}%`, amt(order.cgst));
    d.lr(`SGST @ ${half}%`, amt(order.sgst));
  }
  if (Number(order.round_off) !== 0) d.lr('Round off', (order.round_off > 0 ? '+' : '') + amt(order.round_off));
  d.hr();
  d.lr('TOTAL', 'Rs. ' + amt(order.total), { big: true, bold: true });
  d.hr();
  d.lr('Paid by', PAYMENT_MODES[order.payment_mode] || order.payment_mode);
  if (order.tax_note) d.left(order.tax_note);
  if (order.notes) d.left('Note: ' + order.notes);

  const loy = order.loyalty;
  if (loy && order.status !== 'cancelled') {
    d.hr();
    d.center(`Visit #${loy.visits} - thank you for coming back!`, { bold: true });
    const ready = (loy.rewards || []).filter((r) => r.available > 0);
    ready.forEach((r) => d.center(`Reward ready next time: FREE ${r.reward_item_name}`));
    const next = nextRewardText(loy.rewards);
    if (next) d.center(next);
  }
  if (provisional) {
    d.hr();
    d.center('Made while offline. The final bill number is given when the tablet is back online.');
  }
  if (s.bill_footer) { d.hr(); d.center(s.bill_footer); }
  return d.lines;
}

export function kotDoc(order, { width = 48 } = {}) {
  const d = new Doc(width);
  d.center('KITCHEN ORDER', { bold: true });
  d.center(`TOKEN ${order.token_no}`, { big: true, bold: true });
  d.center(orderTypeLabel(order).toUpperCase(), { bold: true });
  d.center(fmtBillDate(order.created_at));
  d.hr();
  for (const it of order.items || []) d.left(`${it.qty} x ${it.name}${it.is_reward ? ' (free)' : ''}`, { big: true, bold: true });
  if (order.notes) { d.hr(); d.left('NOTE: ' + order.notes, { bold: true }); }
  return d.lines;
}

// ---------- renderers ----------

export function toEscPos(docs) {
  const out = [0x1b, 0x40]; // initialise
  docs.forEach((lines) => {
    for (const ln of lines) {
      out.push(0x1b, 0x45, ln.bold ? 1 : 0);      // bold on/off
      out.push(0x1d, 0x21, ln.big ? 0x11 : 0x00); // double width+height
      for (const ch of toAscii(ln.text)) out.push(ch.charCodeAt(0));
      out.push(0x0a);
    }
    out.push(0x1b, 0x45, 0, 0x1d, 0x21, 0);
    out.push(0x1b, 0x64, 4);                       // feed 4 lines
    out.push(0x1d, 0x56, 0x42, 0x00);              // cut
  });
  return new Uint8Array(out);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(docs, width = 48) {
  const paper = width >= 42 ? 80 : 58;
  const body = docs
    .map((lines) => `<section>${lines.map((l) =>
      `<div class="${l.big ? 'big ' : ''}${l.bold ? 'b' : ''}">${esc(l.text) || '&nbsp;'}</div>`).join('')}</section>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title><style>
@page { size: ${paper}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${paper}mm; }
section { padding: 2mm ${paper === 80 ? 4 : 5}mm 6mm; page-break-after: always; break-after: page; }
section:last-child { page-break-after: auto; break-after: auto; }
div { font: 2.5mm/1.3 "Courier New", Courier, monospace; white-space: pre; overflow: hidden; }
.b { font-weight: 700; }
.big { font-size: 5mm; line-height: 1.25; }
</style></head><body>${body}</body></html>`;
}
