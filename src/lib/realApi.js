// Every call the app makes to Supabase lives here.
import { supabase } from './supabase';

function toError(e) {
  const err = new Error(e?.message || 'Request failed');
  err.code = e?.code;
  return err;
}

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw toError(error);
  return data;
}

const rpc = (fn, args = {}) => q(supabase.rpc(fn, args));

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

async function save(table, row, fields) {
  const values = pick(row, fields);
  if (row.id) return q(supabase.from(table).update(values).eq('id', row.id).select().single());
  return q(supabase.from(table).insert(values).select().single());
}

export const realApi = {
  // ---- auth ----
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toError(error);
  },
  signOut: () => supabase.auth.signOut(),
  getMyStaff: (userId) => q(supabase.from('staff').select('*').eq('user_id', userId).maybeSingle()),

  // ---- settings & menu ----
  getSettings: () => q(supabase.from('settings').select('*').eq('id', 1).single()),
  updateSettings: (patch) =>
    q(supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single()),

  async getMenu() {
    const [categories, items] = await Promise.all([
      q(supabase.from('categories').select('*').order('sort').order('name')),
      q(supabase.from('menu_items').select('*').order('sort').order('name')),
    ]);
    return { categories, items };
  },
  saveCategory: (c) => save('categories', c, ['name', 'sort', 'active']),
  deleteCategory: (id) => q(supabase.from('categories').delete().eq('id', id)),
  saveMenuItem: (i) => save('menu_items', i, ['category_id', 'name', 'price', 'is_veg', 'available', 'sort']),
  deleteMenuItem: (id) => q(supabase.from('menu_items').delete().eq('id', id)),

  // ---- orders ----
  lookupCustomer: (phone) => rpc('lookup_customer', { p_phone: phone }),
  placeOrder: (payload) => rpc('place_order', { p: payload }),
  listOrders: (filters = {}) => rpc('list_orders', { p: filters }),
  getOrder: (id) => rpc('get_order', { p_id: id }),
  setOrderStatus: (id, status, reason = null) => rpc('set_order_status', { p_id: id, p_status: status, p_reason: reason }),
  subscribeOrders(onChange) {
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  // ---- public ----
  getQueue: () => rpc('get_queue'),
  checkRewards: (phone) => rpc('check_rewards', { p_phone: phone }),

  // ---- admin ----
  salesReport: (from, to) => rpc('sales_report', { p_from: from, p_to: to }),
  listRewardRules: () => q(supabase.from('reward_rules').select('*').order('visits_required')),
  saveRewardRule: (r) => save('reward_rules', r, ['name', 'visits_required', 'reward_item_id', 'reward_qty', 'repeating', 'active']),
  deleteRewardRule: (id) => q(supabase.from('reward_rules').delete().eq('id', id)),

  async listCustomers({ search = '', limit = 50, offset = 0 } = {}) {
    let qb = supabase.from('customers').select('*', { count: 'exact' });
    const s = search.replace(/[^\w\s]/g, '').trim();
    if (s) qb = qb.or(`phone.ilike.%${s}%,name.ilike.%${s}%`);
    qb = qb.order('visits', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await qb;
    if (error) throw toError(error);
    return { rows: data, total: count ?? data.length };
  },
  updateCustomer: (phone, name) => rpc('update_customer', { p_phone: phone, p_name: name }),
  deleteCustomer: (phone) => rpc('delete_customer', { p_phone: phone }),

  listStaff: () => rpc('list_staff'),
  addStaff: (email, name, role) => rpc('add_staff', { p_email: email, p_name: name, p_role: role }),
  updateStaff: (s) => rpc('update_staff', { p_user_id: s.user_id, p_name: s.name, p_role: s.role, p_active: s.active }),
};
