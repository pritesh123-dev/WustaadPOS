import { useState } from 'react';
import { api, DEMO } from '../../lib/api';
import { useApp } from '../../components/ui';

export default function SettingsAdmin() {
  const { settings, setSettings, toast } = useApp();
  const [v, setV] = useState(settings);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.updateSettings({
        shop_name: v.shop_name.trim(), tagline: v.tagline, address: v.address, phone: v.phone, gstin: v.gstin.trim().toUpperCase(),
        fssai: v.fssai, gst_rate: Number(v.gst_rate), prices_include_gst: v.prices_include_gst,
        invoice_prefix: v.invoice_prefix.trim().toUpperCase(), day_start_hour: Number(v.day_start_hour), bill_footer: v.bill_footer,
      });
      setSettings(saved); setV(saved); toast('Settings saved', 'ok');
    } catch (err) { toast(err.message, 'error', 6000); }
    finally { setBusy(false); }
  };

  return (
    <form className="page narrow stack" onSubmit={save}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <div className="card stack">
        <h2>Shop details (printed on bills)</h2>
        <div className="row wrap">
          <label className="field grow">Shop name<input className="input" value={v.shop_name} onChange={set('shop_name')} required /></label>
          <label className="field grow">Tagline<input className="input" value={v.tagline} onChange={set('tagline')} /></label>
        </div>
        <label className="field">Address<input className="input" value={v.address} onChange={set('address')} /></label>
        <div className="row wrap">
          <label className="field grow">Phone<input className="input" value={v.phone} onChange={set('phone')} /></label>
          <label className="field grow">GSTIN<input className="input" value={v.gstin} onChange={set('gstin')} maxLength={15} /></label>
          <label className="field grow">FSSAI licence no.<input className="input" value={v.fssai} onChange={set('fssai')} /></label>
        </div>
        <label className="field">Message at the bottom of the bill<input className="input" value={v.bill_footer} onChange={set('bill_footer')} /></label>
      </div>
      <div className="card stack">
        <h2>Tax & numbering</h2>
        <div className="row wrap">
          <label className="field" style={{ width: 160 }}>GST rate (%)<input className="input" inputMode="decimal" value={v.gst_rate} onChange={set('gst_rate')} /></label>
          <label className="field" style={{ width: 200 }}>Bill number prefix<input className="input" value={v.invoice_prefix} onChange={set('invoice_prefix')} maxLength={4} /></label>
          <label className="field" style={{ width: 220 }}>New day (tokens restart) at
            <select className="input" value={v.day_start_hour} onChange={set('day_start_hour')}>
              {Array.from({ length: 13 }, (_, h) => <option key={h} value={h}>{h === 0 ? '12 midnight' : `${h}:00 AM`}</option>)}
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={v.prices_include_gst} onChange={set('prices_include_gst')} />Menu prices already include GST</label>
        <p className="small muted" style={{ margin: 0 }}>
          Restaurants usually charge 5% GST (2.5% CGST + 2.5% SGST) without input tax credit — confirm the rate with your CA.
          Bills look like <b>{(v.invoice_prefix || 'WS').toUpperCase()}/2627/00001</b>: the number restarts every financial year (1 April), as GST rules require.
          Swiggy/Zomato orders are billed without GST because the platform pays it.
        </p>
      </div>
      <div className="row">
        <span className="spacer" />
        <button className="btn primary lg" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>
      {DEMO && <button type="button" className="btn danger" onClick={() => { if (confirm('Reset all demo data?')) { api.resetDemo(); location.reload(); } }}>Reset demo data</button>}
    </form>
  );
}
