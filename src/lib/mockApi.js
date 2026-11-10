// In-browser demo backend ("npm run demo"). Same functions as realApi, data kept in localStorage.
// It copies the database rules (tokens, invoice numbers, GST, visits, rewards) so the demo behaves like the real thing.
import { businessDate, computeTotals, normalizePhone, round2, uuid, addDays } from './format';

const KEY = 'wpos.demo.v1';
const SESSION_KEY = 'wpos.demo.session';
const listeners = new Set();
const authListeners = new Set();
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

const USERS = [
  { id: 'demo-admin', email: 'owner@demo.in', name: 'Owner', role: 'admin', active: true },
  { id: 'demo-cashier', email: 'cashier@demo.in', name: 'Ravi', role: 'cashier', active: true },
];

const SEED_MENU = [
  ['Biryani', [['Chicken Dum Biryani', 229, 0], ['Chicken Dum Biryani (Family)', 599, 0], ['Mutton Dum Biryani', 329, 0], ['Egg Biryani', 179, 0], ['Veg Dum Biryani', 169, 1], ['Paneer Biryani', 199, 1]]],
  ['Starters', [['Chicken 65', 199, 0], ['Apollo Fish', 249, 0], ['Chicken Tikka', 239, 0], ['Paneer 65', 189, 1]]],
  ['Chinese', [['Chicken Fried Rice', 169, 0], ['Veg Fried Rice', 139, 1], ['Chicken Hakka Noodles', 169, 0], ['Veg Hakka Noodles', 139, 1], ['Chilli Chicken', 209, 0], ['Veg Manchurian', 159, 1]]],
  ['Breads & Sides', [['Mirchi Ka Salan', 49, 1], ['Raita', 39, 1], ['Rumali Roti', 25, 1]]],
  ['Desserts', [['Double Ka Meetha', 79, 1], ['Qubani Ka Meetha', 99, 1]]],
  ['Beverages', [['Soft Drink (300ml)', 40, 1], ['Water Bottle (1L)', 20, 1], ['Irani Chai', 25, 1]]],
];

function fyLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return String(start % 100).padStart(2, '0') + String((start + 1) % 100).padStart(2, '0');
}

function seed() {
  const s = {
    settings: {
      id: 1, shop_name: 'Wustaad', tagline: 'Hyderabadi Biryani & Chinese', address: 'Bhubaneswar, Odisha',
      phone: '', gstin: '', fssai: '', gst_rate: 5, prices_include_gst: false, invoice_prefix: 'WS',
      day_start_hour: 4, bill_footer: 'Thank you! Visit again.',
    },
    staff: USERS.map(({ id, name, role, active }) => ({ user_id: id, name, role, active })),
    categories: [], items: [], customers: {}, rules: [], redemptions: [], orders: [],
    tokenCounters: {}, invoiceCounters: {}, seq: 1000,
  };
  SEED_MENU.forEach(([cat, items], ci) => {
    const c = { id: ci + 1, name: cat, sort: ci + 1, active: true };
    s.categories.push(c);
    items.forEach(([name, price, veg], ii) =>
      s.items.push({ id: s.items.length + 1, category_id: c.id, name, price, is_veg: !!veg, available: true, sort: ii + 1 }));
  });
  const itemId = (n) => s.items.find((i) => i.name === n).id;
  s.rules.push({ id: 1, name: 'Every 5th visit: free Double Ka Meetha', visits_required: 5, reward_item_id: itemId('Double Ka Meetha'), reward_qty: 1, repeating: true, active: true });
  s.rules.push({ id: 2, name: 'Every 10th visit: free Chicken Dum Biryani', visits_required: 10, reward_item_id: itemId('Chicken Dum Biryani'), reward_qty: 1, repeating: true, active: true });

  // Two weeks of sample sales so the reports have something to show.
  let rnd = 7;
  const rand = (n) => { rnd = (rnd * 16807) % 2147483647; return rnd % n; };
  const phones = ['9876543210', '9937012345', '9861122334', '7008123456', '8249001122', '9437765432'];
  const now = Date.now();
  for (let day = 13; day >= 1; day--) {
    const n = 14 + rand(16);
    for (let k = 0; k < n; k++) {
      const hour = [12, 13, 13, 14, 19, 20, 20, 21, 21, 22][rand(10)];
      const ts = new Date(now - day * 86400e3);
      ts.setUTCHours(hour - 5, rand(60) - 30, 0, 0); // IST = UTC+5:30
      const lines = [];
      const count = 1 + rand(3);
      for (let j = 0; j < count; j++) lines.push({ item_id: s.items[rand(s.items.length)].id, qty: 1 + rand(2) });
      const type = ['dine_in', 'takeaway', 'takeaway', 'online'][rand(4)];
      createOrder(s, {
        order_type: type, table_no: type === 'dine_in' ? String(1 + rand(8)) : null,
        online_source: type === 'online' ? ['swiggy', 'zomato'][rand(2)] : null,
        payment_mode: type === 'online' ? 'online' : ['cash', 'upi', 'upi', 'card'][rand(4)],
        customer_phone: rand(3) === 0 ? phones[rand(phones.length)] : null,
        items: lines, created_at: ts.toISOString(),
      }, 'demo-admin', true);
    }
  }
  s.orders.forEach((o) => { o.status = 'completed'; o.completed_at = o.created_at; });
  return s;
}

let cache = null;
function load() {
  try { cache = JSON.parse(localStorage.getItem(KEY)) || null; } catch { cache = null; }
  if (!cache) { cache = seed(); persist(); }
  return cache;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn());
}
window.addEventListener?.('storage', (e) => { if (e.key === KEY) listeners.forEach((fn) => fn()); });

function currentUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function staffOf(s, user = currentUser()) {
  return user && s.staff.find((x) => x.user_id === user.id && x.active);
}
function requireStaff(s) {
  const st = staffOf(s);
  if (!st) throw new Error('Not allowed: please log in with a staff account');
  return st;
}
function requireAdmin(s) {
  const st = requireStaff(s);
  if (st.role !== 'admin') throw new Error('Not allowed: admin only');
  return st;
}
const bdate = (s, ts = new Date()) => businessDate(new Date(ts), s.settings.day_start_hour);

function rewardStatus(s, phone, visits) {
  return s.rules.filter((r) => r.active).sort((a, b) => a.visits_required - b.visits_required).map((r) => {
    const earned = r.repeating ? Math.floor(visits / r.visits_required) : visits >= r.visits_required ? 1 : 0;
    const redeemed = s.redemptions.filter((d) => d.phone === phone && d.rule_id === r.id).length;
    const item = s.items.find((i) => i.id === r.reward_item_id);
    return {
      rule_id: r.id, name: r.name, visits_required: r.visits_required, reward_item_id: r.reward_item_id,
      reward_item_name: item?.name || '?', reward_qty: r.reward_qty, repeating: r.repeating,
      earned, redeemed, available: Math.max(earned - redeemed, 0),
      visits_to_next: r.repeating || visits < r.visits_required ? r.visits_required - (visits % r.visits_required) : null,
    };
  });
}

function orderJson(s, o) {
  const c = o.customer_phone && s.customers[o.customer_phone];
  return {
    ...clone(o),
    loyalty: c ? { visits: c.visits, rewards: rewardStatus(s, c.phone, c.visits) } : null,
    created_by_name: s.staff.find((x) => x.user_id === o.created_by)?.name || null,
  };
}

function visitCountsOn(s, phone, day) {
  return !s.orders.some((o) => o.customer_phone === phone && o.business_date === day && o.counted_visit && o.status !== 'cancelled');
}

function createOrder(s, p, userId, seeding = false) {
  if (p.client_ref) {
    const existing = s.orders.find((o) => o.client_ref === p.client_ref);
    if (existing) return existing;
  }
  const type = p.order_type || 'takeaway';
  if (!['dine_in', 'takeaway', 'online'].includes(type)) throw new Error('Invalid order type');
  const phone = normalizePhone(p.customer_phone);
  const ts = p.created_at ? new Date(p.created_at) : new Date();
  const day = bdate(s, ts);
  const source = (p.online_source || '').toLowerCase() || null;
  let visits = 0;
  let counts = false;
  if (phone) {
    const c = (s.customers[phone] ||= { phone, name: null, visits: 0, total_spent: 0, last_visit_date: null, created_at: ts.toISOString() });
    if (p.customer_name) c.name = p.customer_name.trim();
    counts = visitCountsOn(s, phone, day);
    if (counts) { c.visits += 1; c.last_visit_date = !c.last_visit_date || c.last_visit_date < day ? day : c.last_visit_date; }
    visits = c.visits;
  }
  const taken = (t) => s.orders.some((o) => o.business_date === day && o.token_no === t);
  let token;
  if (p.offline_token && !taken(p.offline_token)) token = p.offline_token;
  else {
    token = (s.tokenCounters[day] || 0) + 1;
    while (taken(token)) token++;
    s.tokenCounters[day] = token;
  }
  const fy = fyLabel(day);
  const invNo = (s.invoiceCounters[fy] || 0) + 1;
  s.invoiceCounters[fy] = invNo;
  const aggregator = type === 'online' && ['swiggy', 'zomato'].includes(source);
  const rate = aggregator ? 0 : Number(s.settings.gst_rate);

  const id = uuid();
  const items = [];
  let sub = 0;
  for (const line of p.items || []) {
    const m = s.items.find((i) => i.id === Number(line.item_id));
    if (!m) throw new Error(`Menu item ${line.item_id} no longer exists`);
    const qty = Number(line.qty);
    if (!(qty >= 1 && qty <= 500)) throw new Error('Invalid quantity');
    items.push({ id: ++s.seq, order_id: id, item_id: m.id, name: m.name, price: m.price, qty, line_total: round2(m.price * qty), is_reward: false, reward_rule_id: null });
    sub += m.price * qty;
  }
  const redeem = p.redeem_rule_ids || [];
  if (redeem.length) {
    if (!phone) throw new Error('Customer mobile number is required to redeem a reward');
    const status = rewardStatus(s, phone, visits);
    const counts2 = {};
    redeem.forEach((r) => { counts2[r] = (counts2[r] || 0) + 1; });
    for (const [ruleId, n] of Object.entries(counts2)) {
      const st = status.find((x) => x.rule_id === Number(ruleId));
      if (!st || st.available < n) throw new Error('This reward is not available for the customer yet');
      for (let i = 0; i < n; i++) {
        items.push({ id: ++s.seq, order_id: id, item_id: st.reward_item_id, name: st.reward_item_name, price: 0, qty: st.reward_qty, line_total: 0, is_reward: true, reward_rule_id: st.rule_id });
        s.redemptions.push({ phone, rule_id: st.rule_id, order_id: id });
      }
    }
  }
  if (!items.length) throw new Error('The order has no items');
  const t = computeTotals(sub, { rate, inclusive: s.settings.prices_include_gst, discount: Number(p.discount) || 0 });
  const o = {
    id, client_ref: p.client_ref || null,
    invoice_no: `${s.settings.invoice_prefix}/${fy}/${String(invNo).padStart(5, '0')}`,
    token_no: token, business_date: day, order_type: type,
    table_no: type === 'dine_in' ? p.table_no || null : null,
    online_source: type === 'online' ? source || 'other' : null,
    customer_phone: phone, customer_name: p.customer_name?.trim() || null,
    status: 'preparing', payment_mode: p.payment_mode || 'cash', gst_rate: rate, ...t,
    tax_note: aggregator ? 'GST on this order is paid by the delivery platform (Sec 9(5) CGST Act)' : null,
    counted_visit: counts, visit_no: phone ? visits : null, notes: p.notes || null, cancel_reason: null,
    created_by: userId, created_at: ts.toISOString(), ready_at: null, completed_at: null, items,
  };
  s.orders.push(o);
  if (phone) s.customers[phone].total_spent = round2(s.customers[phone].total_spent + t.total);
  if (!seeding) persist();
  return o;
}

const sum = (arr, f) => round2(arr.reduce((a, x) => a + Number(f(x) || 0), 0));
function groupBy(arr, keyFn) {
  const m = new Map();
  arr.forEach((x) => { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

export const mockApi = {
  demo: true,
  async getSession() {
    const u = currentUser();
    return u ? { user: u } : null;
  },
  onAuthChange(cb) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },
  async signIn(email) {
    await wait();
    const u = USERS.find((x) => x.email === String(email).trim().toLowerCase());
    if (!u) throw new Error('Demo logins: owner@demo.in (admin) or cashier@demo.in (cashier), any password');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: u.id, email: u.email }));
    authListeners.forEach((cb) => cb({ user: { id: u.id, email: u.email } }));
  },
  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    authListeners.forEach((cb) => cb(null));
  },
  async getMyStaff(userId) {
    const s = load();
    return clone(s.staff.find((x) => x.user_id === userId) || null);
  },

  async getSettings() { return clone(load().settings); },
  async updateSettings(patch) {
    const s = load(); requireAdmin(s);
    Object.assign(s.settings, patch); persist(); return clone(s.settings);
  },
  async getMenu() {
    const s = load(); requireStaff(s); await wait(60);
    const bySort = (a, b) => a.sort - b.sort || a.name.localeCompare(b.name);
    return { categories: clone(s.categories).sort(bySort), items: clone(s.items).sort(bySort) };
  },
  async saveCategory(c) {
    const s = load(); requireAdmin(s);
    if (s.categories.some((x) => x.name.toLowerCase() === c.name.trim().toLowerCase() && x.id !== c.id)) throw new Error('A category with this name already exists');
    if (c.id) Object.assign(s.categories.find((x) => x.id === c.id), c);
    else s.categories.push({ ...c, id: Math.max(0, ...s.categories.map((x) => x.id)) + 1 });
    persist();
  },
  async deleteCategory(id) {
    const s = load(); requireAdmin(s);
    s.categories = s.categories.filter((x) => x.id !== id);
    s.items.forEach((i) => { if (i.category_id === id) i.category_id = null; });
    persist();
  },
  async saveMenuItem(item) {
    const s = load(); requireAdmin(s);
    if (item.id) Object.assign(s.items.find((x) => x.id === item.id), item);
    else s.items.push({ ...item, id: Math.max(0, ...s.items.map((x) => x.id)) + 1 });
    persist();
  },
  async deleteMenuItem(id) {
    const s = load(); requireAdmin(s);
    if (s.rules.some((r) => r.reward_item_id === id)) throw new Error('This item is used by a reward rule. Change the rule first, or mark the item unavailable.');
    s.items = s.items.filter((x) => x.id !== id); persist();
  },

  async lookupCustomer(phoneInput) {
    const s = load(); requireStaff(s); await wait();
    const phone = normalizePhone(phoneInput);
    if (!phone) throw new Error('Enter a mobile number');
    const c = s.customers[phone];
    const counts = visitCountsOn(s, phone, bdate(s));
    const visitNo = (c?.visits || 0) + (counts ? 1 : 0);
    return { found: !!c, phone, name: c?.name || null, visits: c?.visits || 0, total_spent: c?.total_spent || 0, last_visit_date: c?.last_visit_date || null, visit_counts_today: counts, visit_no: visitNo, rewards: rewardStatus(s, phone, visitNo) };
  },
  async placeOrder(p) {
    const s = load(); const st = requireStaff(s); await wait(200);
    const before = clone(s);
    try { return orderJson(s, createOrder(s, p, st.user_id)); }
    catch (e) { cache = before; throw e; }
  },
  async listOrders(f = {}) {
    const s = load(); const st = requireStaff(s); await wait(60);
    const today = bdate(s);
    let from = f.from || today; const to = f.to || f.from || today;
    if (st.role !== 'admin' && from < addDays(today, -1)) from = addDays(today, -1);
    const q = (f.search || '').trim().toLowerCase();
    const rows = s.orders.filter((o) => o.business_date >= from && o.business_date <= to
      && (!f.status || f.status.includes(o.status)) && (!f.order_type || o.order_type === f.order_type)
      && (!q || o.invoice_no.toLowerCase().includes(q) || (o.customer_phone || '').includes(q) || (o.customer_name || '').toLowerCase().includes(q) || String(o.token_no) === q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const offset = f.offset || 0; const limit = f.limit || 200;
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map((o) => orderJson(s, o)) };
  },
  async getOrder(id) {
    const s = load(); requireStaff(s);
    const o = s.orders.find((x) => x.id === id);
    return o ? orderJson(s, o) : null;
  },
  async setOrderStatus(id, status, reason) {
    const s = load(); const st = requireStaff(s); await wait();
    const o = s.orders.find((x) => x.id === id);
    if (!o) throw new Error('Order not found');
    if (o.status === 'cancelled') throw new Error('This order is already cancelled');
    if (status === 'cancelled') {
      if (!reason?.trim()) throw new Error('Please give a reason for cancelling');
      if (st.role !== 'admin' && Date.now() - new Date(o.created_at).getTime() > 15 * 60e3) throw new Error('Only an admin can cancel an order older than 15 minutes');
      const c = o.customer_phone && s.customers[o.customer_phone];
      if (c) { c.visits = Math.max(c.visits - (o.counted_visit ? 1 : 0), 0); c.total_spent = Math.max(round2(c.total_spent - o.total), 0); }
      s.redemptions = s.redemptions.filter((d) => d.order_id !== o.id);
      Object.assign(o, { status, cancel_reason: reason.trim(), counted_visit: false });
    } else {
      o.status = status;
      o.ready_at = status === 'ready' ? o.ready_at || new Date().toISOString() : status === 'preparing' ? null : o.ready_at;
      o.completed_at = status === 'completed' ? new Date().toISOString() : null;
    }
    persist();
    return orderJson(s, o);
  },
  subscribeOrders(onChange) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },

  async getQueue() {
    const s = load(); const today = bdate(s);
    const live = s.orders.filter((o) => o.business_date === today && o.order_type !== 'online');
    return {
      shop_name: s.settings.shop_name,
      preparing: live.filter((o) => o.status === 'preparing').map((o) => o.token_no).sort((a, b) => a - b),
      ready: live.filter((o) => o.status === 'ready').sort((a, b) => (b.ready_at || '').localeCompare(a.ready_at || '')).map((o) => o.token_no),
      server_time: new Date().toISOString(),
    };
  },
  async checkRewards(phoneInput) {
    const s = load(); await wait();
    const phone = normalizePhone(phoneInput);
    if (!phone) throw new Error('Enter a mobile number');
    const c = s.customers[phone];
    if (!c) return { found: false, rewards: rewardStatus(s, phone, 0) };
    return { found: true, visits: c.visits, last_visit_date: c.last_visit_date, rewards: rewardStatus(s, phone, c.visits) };
  },

  async salesReport(from, to) {
    const s = load(); requireAdmin(s); await wait();
    const all = s.orders.filter((o) => o.business_date >= from && o.business_date <= to);
    const ok = all.filter((o) => o.status !== 'cancelled');
    const cancelled = all.filter((o) => o.status === 'cancelled');
    const items = ok.flatMap((o) => o.items);
    const agg = (map, key) => [...map].map(([k, v]) => ({ [key]: k, orders: v.length, total: sum(v, (o) => o.total) }));
    const hourOf = (o) => Number(new Date(o.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24;
    const top = [...groupBy(items, (i) => i.name)].map(([name, v]) => ({
      name, qty: v.filter((i) => !i.is_reward).reduce((a, i) => a + i.qty, 0),
      free_qty: v.filter((i) => i.is_reward).reduce((a, i) => a + i.qty, 0), amount: sum(v, (i) => i.line_total),
    })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 20);
    return {
      from, to,
      summary: {
        orders: ok.length, total: sum(ok, (o) => o.total), taxable: sum(ok, (o) => o.taxable_value),
        cgst: sum(ok, (o) => o.cgst), sgst: sum(ok, (o) => o.sgst), discount: sum(ok, (o) => o.discount),
        avg_ticket: ok.length ? round2(sum(ok, (o) => o.total) / ok.length) : 0,
        unique_customers: new Set(ok.map((o) => o.customer_phone).filter(Boolean)).size,
      },
      cancelled: { orders: cancelled.length, total: sum(cancelled, (o) => o.total) },
      by_day: agg(groupBy(ok, (o) => o.business_date), 'date').sort((a, b) => a.date.localeCompare(b.date)),
      by_type: agg(groupBy(ok, (o) => o.order_type), 'order_type').sort((a, b) => b.total - a.total),
      by_payment: agg(groupBy(ok, (o) => o.payment_mode), 'payment_mode').sort((a, b) => b.total - a.total),
      by_hour: agg(groupBy(ok, hourOf), 'hour').sort((a, b) => a.hour - b.hour),
      top_items: top,
      rewards_redeemed: items.filter((i) => i.is_reward).length,
      new_customers: Object.values(s.customers).filter((c) => { const d = bdate(s, c.created_at); return d >= from && d <= to; }).length,
    };
  },
  async listRewardRules() { const s = load(); requireStaff(s); return clone(s.rules); },
  async saveRewardRule(r) {
    const s = load(); requireAdmin(s);
    if (r.id) Object.assign(s.rules.find((x) => x.id === r.id), r);
    else s.rules.push({ ...r, id: Math.max(0, ...s.rules.map((x) => x.id)) + 1 });
    persist();
  },
  async deleteRewardRule(id) {
    const s = load(); requireAdmin(s);
    if (s.redemptions.some((d) => d.rule_id === id)) throw new Error('This rule has already been redeemed by customers. Switch it off instead of deleting.');
    s.rules = s.rules.filter((x) => x.id !== id); persist();
  },
  async listCustomers({ search = '', limit = 50, offset = 0 } = {}) {
    const s = load(); requireStaff(s); await wait(60);
    const q = search.toLowerCase().trim();
    const rows = Object.values(s.customers).filter((c) => !q || c.phone.includes(q) || (c.name || '').toLowerCase().includes(q))
      .sort((a, b) => b.visits - a.visits || b.created_at.localeCompare(a.created_at));
    return { rows: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async updateCustomer(phone, name) {
    const s = load(); requireStaff(s);
    const c = s.customers[normalizePhone(phone)]; if (c) c.name = name?.trim() || null; persist();
  },
  async deleteCustomer(phone) {
    const s = load(); requireAdmin(s); const p = normalizePhone(phone);
    s.orders.forEach((o) => { if (o.customer_phone === p) { o.customer_phone = null; o.customer_name = null; } });
    s.redemptions = s.redemptions.filter((d) => d.phone !== p);
    delete s.customers[p]; persist();
  },
  async listStaff() {
    const s = load(); requireAdmin(s);
    return s.staff.map((x) => ({ ...x, email: USERS.find((u) => u.id === x.user_id)?.email || x.email }));
  },
  async addStaff(email, name, role) {
    const s = load(); requireAdmin(s);
    throw new Error(`Demo mode: in the real app, first create the login for ${email} in Supabase → Authentication → Users, then add ${name} (${role}) here.`);
  },
  async updateStaff(row) {
    const s = load(); requireAdmin(s);
    const before = clone(s.staff);
    Object.assign(s.staff.find((x) => x.user_id === row.user_id), { name: row.name, role: row.role, active: row.active });
    if (!s.staff.some((x) => x.role === 'admin' && x.active)) { s.staff = before; throw new Error('At least one active admin is required'); }
    persist(); return this.listStaff();
  },
  resetDemo() { localStorage.removeItem(KEY); cache = null; load(); },
};

