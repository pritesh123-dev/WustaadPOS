import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, configured, DEMO } from './lib/api';
import { cache, getQueue, onQueueChange, syncQueue } from './lib/offline';
import { useRoute } from './lib/router';
import { AppContext, useApp, useToasts } from './components/ui';
import Login from './pages/Login';
import POS from './pages/POS';
import Orders from './pages/Orders';
import Display from './pages/Display';
import RewardsCheck from './pages/RewardsCheck';
import PrinterSettings from './pages/PrinterSettings';
import Reports from './pages/admin/Reports';
import MenuAdmin from './pages/admin/MenuAdmin';
import RewardsAdmin from './pages/admin/RewardsAdmin';
import Customers from './pages/admin/Customers';
import StaffAdmin from './pages/admin/StaffAdmin';
import SettingsAdmin from './pages/admin/SettingsAdmin';

export default function App() {
  const route = useRoute();
  // Public screens: no login needed
  if (route === '/display') return <Display />;
  if (route === '/rewards') return <RewardsCheck />;
  if (!configured) return <SetupNeeded />;
  return <StaffApp route={route} />;
}

function SetupNeeded() {
  return (
    <div className="page narrow">
      <div className="card stack">
        <h1>Connect Supabase</h1>
        <p>Create a file named <code>.env</code> in the project folder (copy <code>.env.example</code>) and fill in your Supabase URL and anon key, then restart <code>npm run dev</code>.</p>
        <p className="muted">Want to look around first? Run <code>npm run demo</code> to use the app with sample data.</p>
      </div>
    </div>
  );
}

const ADMIN_ROUTES = ['/admin', '/admin/menu', '/admin/rewards', '/admin/customers', '/admin/staff', '/admin/settings'];

function StaffApp({ route }) {
  const [toast, toastView] = useToasts();
  const [session, setSession] = useState(undefined);
  const [staff, setStaff] = useState(() => cache.get('staff'));
  const [settings, setSettings] = useState(() => cache.get('settings'));
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState(getQueue);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    api.getSession().then(setSession).catch(() => setSession(null));
    return api.onAuthChange((s) => setSession(s));
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (session === null) { setStaff(null); cache.set('staff', null); }
  }, [session]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const [me, st] = await Promise.all([api.getMyStaff(userId), api.getSettings()]);
        if (!alive) return;
        setStaff(me); cache.set('staff', me);
        setSettings(st); cache.set('settings', st);
        setProfileError(me ? null : `The login ${session?.user?.email || ''} is not set up as staff yet.`);
      } catch (e) {
        // Offline: keep using the cached profile/settings
        if (alive && !cache.get('staff')) setProfileError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  // online/offline + background sync of bills made offline
  const runSync = useCallback(async () => {
    if (!getQueue().length) return;
    const saved = await syncQueue();
    if (saved.length) toast(`${saved.length} offline bill${saved.length > 1 ? 's' : ''} synced`, 'ok');
  }, [toast]);
  useEffect(() => {
    const up = () => { setOnline(true); runSync(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const unsub = onQueueChange(setQueue);
    const timer = setInterval(runSync, 30000);
    runSync();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); unsub(); clearInterval(timer); };
  }, [runSync]);

  const ctx = useMemo(() => ({
    staff, settings, setSettings: (s) => { setSettings(s); cache.set('settings', s); },
    isAdmin: staff?.role === 'admin', toast, online, queue, runSync,
  }), [staff, settings, toast, online, queue, runSync]);

  if (session === undefined) return <div className="empty">Loading…</div>;
  if (!session) return <><Login />{toastView}</>;
  if (profileError) return <ErrorScreen msg={profileError} />;
  if (!staff || staff.user_id !== userId || !settings) return <div className="empty">Loading your profile…</div>;
  if (!staff.active) return <ErrorScreen msg="This staff account is switched off. Ask the owner to turn it on." />;

  let page;
  const isAdminRoute = ADMIN_ROUTES.includes(route);
  if (isAdminRoute && staff.role !== 'admin') page = <div className="page"><div className="card">Only the admin can open this page.</div></div>;
  else if (route === '/orders') page = <Orders />;
  else if (route === '/printer') page = <PrinterSettings />;
  else if (route === '/admin') page = <Reports />;
  else if (route === '/admin/menu') page = <MenuAdmin />;
  else if (route === '/admin/rewards') page = <RewardsAdmin />;
  else if (route === '/admin/customers') page = <Customers />;
  else if (route === '/admin/staff') page = <StaffAdmin />;
  else if (route === '/admin/settings') page = <SettingsAdmin />;
  else page = <POS />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <TopBar route={route} />
        {DEMO && <div className="banner info">Demo mode — sample data stored only in this browser. Logins: owner@demo.in (admin) or cashier@demo.in (cashier), any password.</div>}
        {!online && <div className="banner warn">No internet. You can keep billing — bills are saved on this tablet and sent automatically when the internet is back.</div>}
        {page}
      </div>
      {toastView}
    </AppContext.Provider>
  );
}

function ErrorScreen({ msg }) {
  return (
    <div className="page narrow">
      <div className="card stack">
        <h2>Can’t open the app</h2>
        <p>{msg}</p>
        <p className="muted small">If this is a new login, the owner needs to add it under Admin → Staff.</p>
        <div><button className="btn" onClick={() => api.signOut()}>Log out</button></div>
      </div>
    </div>
  );
}

function TopBar({ route }) {
  const { staff, settings, isAdmin, online, queue, runSync } = useAppSafe();
  const link = (path, label) => <a key={path} href={'#' + path} className={route === path || (path === '/pos' && route === '/') ? 'on' : ''}>{label}</a>;
  return (
    <header className="topbar no-print">
      <div className="brand">{settings?.shop_name || 'Wustaad'}<small>POS</small></div>
      <nav className="nav">
        {link('/pos', 'Billing')}
        {link('/orders', 'Orders')}
        <a href="#/display" target="_blank" rel="noreferrer">Token screen ↗</a>
        {link('/printer', 'Printer')}
        {isAdmin && <span className="sep" />}
        {isAdmin && [
          link('/admin', 'Reports'), link('/admin/menu', 'Menu'), link('/admin/rewards', 'Rewards'),
          link('/admin/customers', 'Customers'), link('/admin/staff', 'Staff'), link('/admin/settings', 'Settings'),
        ]}
      </nav>
      {!online && <span className="badge warn">Offline</span>}
      {queue.length > 0 && <button className="badge warn" style={{ border: 0, cursor: 'pointer' }} onClick={runSync} title="Bills waiting to sync — tap to retry">{queue.length} to sync</button>}
      <div className="who">{staff?.name}<br /><span style={{ opacity: .7 }}>{staff?.role}</span></div>
      <button className="btn sm" onClick={() => api.signOut()}>Log out</button>
    </header>
  );
}

const useAppSafe = () => useApp() || {};
