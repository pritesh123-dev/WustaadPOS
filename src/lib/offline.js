// Offline support: menu/settings cache and a queue of bills made while the internet is down.
// Queued bills are sent to Supabase automatically when the connection comes back. Each carries a
// client_ref so a bill can never be saved twice, and an offline token (901, 902, …) that the
// server keeps, so the number printed on the customer's slip stays the same.
import { api } from './api';
import { businessDate } from './format';

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const cache = {
  get: (name, fallback = null) => read('wpos.cache.' + name, fallback),
  set: (name, value) => write('wpos.cache.' + name, value),
};

const QUEUE = 'wpos.queue';
const OFFLINE_TOKEN = 'wpos.offlineToken';
const subscribers = new Set();
const notify = () => subscribers.forEach((fn) => fn(getQueue()));

export const getQueue = () => read(QUEUE, []);
export function onQueueChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }

export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !err?.code && /fetch|network|load failed|timeout|offline/i.test(err?.message || '');
}

export function nextOfflineToken(dayStartHour = 4) {
  const day = businessDate(new Date(), dayStartHour);
  const cur = read(OFFLINE_TOKEN, null);
  const n = cur && cur.day === day ? cur.n + 1 : 901;
  write(OFFLINE_TOKEN, { day, n });
  return n;
}

export function enqueue(payload) {
  const q = getQueue();
  q.push({ payload, error: null, queued_at: new Date().toISOString() });
  write(QUEUE, q);
  notify();
}

let syncing = false;
// Returns the orders that were saved. Stops at the first network error; a bill the server
// rejects (e.g. a deleted menu item) stays in the queue with its error so staff can see it.
export async function syncQueue() {
  if (syncing) return [];
  syncing = true;
  const saved = [];
  try {
    let q = getQueue();
    for (const entry of [...q]) {
      try {
        const order = await api.placeOrder(entry.payload);
        saved.push(order);
        q = getQueue().filter((e) => e.payload.client_ref !== entry.payload.client_ref);
      } catch (err) {
        if (isNetworkError(err)) break;
        q = getQueue().map((e) => (e.payload.client_ref === entry.payload.client_ref ? { ...e, error: err.message } : e));
      }
      write(QUEUE, q);
    }
  } finally {
    syncing = false;
    notify();
  }
  return saved;
}

export function discardQueued(clientRef) {
  write(QUEUE, getQueue().filter((e) => e.payload.client_ref !== clientRef));
  notify();
}
