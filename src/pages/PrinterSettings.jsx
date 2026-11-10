import { useState } from 'react';
import { bluetoothName, bluetoothSupported, getPrinterConfig, pairBluetooth, printOrder, receiptPreviewLines, savePrinterConfig } from '../print/printer';
import { Seg, useApp } from '../components/ui';

const METHODS = [
  ['rawbt', 'Android tablet + RawBT app (recommended)',
    'Install the free “RawBT” app from the Play Store, connect your thermal printer in it (Bluetooth, USB or Wi-Fi), then choose this. Works with almost every ESC/POS printer.'],
  ['bluetooth', 'Bluetooth printer directly (Chrome)',
    'For Bluetooth Low Energy printers, no extra app. Tap “Pair printer” after each app restart. If your printer doesn’t show up, use RawBT.'],
  ['browser', 'Normal print dialog',
    'Uses the device’s print dialog. Best on a Windows/Mac counter PC with the printer driver installed. Set the paper size to 80 mm (or 58 mm) and margins to none.'],
];

export function sampleOrder(settings) {
  const items = [
    { id: 1, name: 'Chicken Dum Biryani', price: 229, qty: 2, line_total: 458, is_reward: false },
    { id: 2, name: 'Double Ka Meetha', price: 0, qty: 1, line_total: 0, is_reward: true },
  ];
  const rate = Number(settings?.gst_rate ?? 5);
  const cgst = Math.round(458 * rate / 2) / 100;
  const gross = 458 + 2 * cgst;
  return {
    token_no: 42, invoice_no: `${settings?.invoice_prefix || 'WS'}/2627/00042`, order_type: 'dine_in', table_no: '4',
    created_at: new Date().toISOString(), created_by_name: 'Ravi', customer_phone: '9876543210', customer_name: 'Asha',
    items, subtotal: 458, discount: 0, taxable_value: 458, gst_rate: rate, cgst, sgst: cgst,
    round_off: Math.round(gross) - gross, total: Math.round(gross), payment_mode: 'upi', status: 'preparing',
    loyalty: { visits: 5, rewards: [{ rule_id: 2, reward_item_name: 'Chicken Dum Biryani', available: 0, visits_to_next: 5 }] },
  };
}

export default function PrinterSettings() {
  const { settings, toast } = useApp();
  const [cfg, setCfg] = useState(getPrinterConfig);
  const [btName, setBtName] = useState(bluetoothName());
  const update = (patch) => { const next = { ...cfg, ...patch }; setCfg(next); savePrinterConfig(next); };
  const sample = sampleOrder(settings);

  const pair = async () => {
    try { setBtName(await pairBluetooth()); toast('Printer connected', 'ok'); } catch (e) { toast(e.message, 'error'); }
  };
  const test = () => printOrder(sample, settings, { reprint: false }).catch((e) => toast('Printer: ' + e.message, 'error'));

  return (
    <div className="page narrow">
      <div className="grid2">
        <div className="card stack">
          <h2>Printer for this tablet</h2>
          {METHODS.map(([v, title, help]) => (
            <label key={v} className="card" style={{ cursor: 'pointer', borderColor: cfg.method === v ? 'var(--green)' : undefined, boxShadow: 'none' }}>
              <div className="row"><input type="radio" name="method" checked={cfg.method === v} onChange={() => update({ method: v })} style={{ width: 20, height: 20, accentColor: 'var(--green)' }} /><b>{title}</b></div>
              <div className="small muted" style={{ marginTop: '.35rem' }}>{help}</div>
              {v === 'bluetooth' && cfg.method === 'bluetooth' && (
                <div className="row" style={{ marginTop: '.5rem' }}>
                  <button className="btn sm" onClick={pair} disabled={!bluetoothSupported()}>Pair printer</button>
                  <span className="small">{bluetoothSupported() ? (btName ? `Connected: ${btName}` : 'Not connected') : 'This browser has no Bluetooth support'}</span>
                </div>
              )}
            </label>
          ))}
          <div className="row wrap">
            <span className="small muted">Paper</span>
            <Seg value={cfg.paper} onChange={(paper) => update({ paper })} options={[[80, '80 mm'], [58, '58 mm']]} />
            <span className="small muted">Copies</span>
            <Seg value={cfg.copies} onChange={(copies) => update({ copies })} options={[[1, '1'], [2, '2']]} />
          </div>
          <label className="check"><input type="checkbox" checked={cfg.autoPrint} onChange={(e) => update({ autoPrint: e.target.checked })} />Print the bill automatically when an order is placed</label>
          <label className="check"><input type="checkbox" checked={cfg.kot} onChange={(e) => update({ kot: e.target.checked })} />Also print a kitchen ticket (KOT)</label>
          <button className="btn primary" onClick={test}>Print a test bill</button>
          <p className="tiny muted" style={{ margin: 0 }}>These settings are saved on this tablet only.</p>
        </div>
        <div className="card">
          <h3>Bill preview</h3>
          <div className="tbl-wrap">
            <div className="paper">
              {receiptPreviewLines(sample, settings, cfg.paper).map((l, i) => (
                <div key={i} className={(l.big ? 'big ' : '') + (l.bold ? 'b' : '')}>{l.text || ' '}</div>
              ))}
            </div>
          </div>
          <p className="tiny muted">Shop name, address, GSTIN and footer come from Admin → Settings.</p>
        </div>
      </div>
    </div>
  );
}
