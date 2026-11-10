// Formatting + money helpers shared by every screen.

export const ORDER_TYPES = { dine_in: 'Dine-in', takeaway: 'Takeaway', online: 'Online' };
export const PAYMENT_MODES = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Paid online', unpaid: 'Unpaid' };
export const ONLINE_SOURCES = { swiggy: 'Swiggy', zomato: 'Zomato', website: 'Website', phone: 'Phone order', other: 'Other' };
export const STATUS_LABELS = { preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };

export const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

export const money = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

// Same GST maths as place_order() in the database (the database is the final word).
export function computeTotals(subtotal, { rate = 5, inclusive = false, discount = 0 } = {}) {
  const sub = round2(subtotal);
  const disc = Math.min(round2(discount || 0), sub);
  let taxable, cgst, sgst, gross;
  if (inclusive) {
    gross = round2(sub - disc);
    taxable = round2(gross / (1 + rate / 100));
    const tax = round2(gross - taxable);
    cgst = round2(tax / 2);
    sgst = round2(tax - cgst);
  } else {
    taxable = round2(sub - disc);
    cgst = round2((taxable * rate) / 200);
    sgst = cgst;
    gross = round2(taxable + cgst + sgst);
  }
  const total = Math.round(gross);
  return { subtotal: sub, discount: disc, taxable_value: taxable, cgst, sgst, round_off: round2(total - gross), total };
}

export const isAggregator = (type, source) => type === 'online' && ['swiggy', 'zomato'].includes(source);

// Mirrors normalize_phone() in the database. Returns null for empty input, throws if invalid.
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) throw new Error('Enter a valid 10-digit mobile number');
  return d;
}

export const maskPhone = (p) => (p ? '******' + String(p).slice(-4) : '');

const IST = 'Asia/Kolkata';
export const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
export const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true }) : '';
export const fmtBillDate = (ts) => {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-GB', { timeZone: IST });
  const time = d.toLocaleTimeString('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};
export const fmtDay = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

// Business day in India time; orders before dayStartHour count as the previous day.
export function businessDate(d = new Date(), dayStartHour = 4) {
  const shifted = new Date(d.getTime() + 5.5 * 3600e3 - dayStartHour * 3600e3);
  return shifted.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const minutesSince = (ts) => Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));

export function orderTypeLabel(o) {
  if (o.order_type === 'dine_in') return 'Dine-in' + (o.table_no ? ` · Table ${o.table_no}` : '');
  if (o.order_type === 'online') return 'Online · ' + (ONLINE_SOURCES[o.online_source] || o.online_source || '');
  return 'Takeaway';
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Next reward line for receipts / screens, e.g. "2 more visits for a free Double Ka Meetha"
export function nextRewardText(rewards = []) {
  const upcoming = rewards.filter((r) => r.visits_to_next != null).sort((a, b) => a.visits_to_next - b.visits_to_next)[0];
  if (!upcoming) return null;
  const n = upcoming.visits_to_next;
  return `${n} more visit${n === 1 ? '' : 's'} for a FREE ${upcoming.reward_item_name}`;
}
