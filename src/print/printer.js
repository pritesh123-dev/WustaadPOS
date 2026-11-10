// Sends bills to the thermal printer. Three ways, chosen per tablet in Printer settings:
//  - rawbt:     Android + the free "RawBT" app. Works with Bluetooth, USB and Wi-Fi/LAN ESC/POS printers. Recommended.
//  - bluetooth: Chrome's Web Bluetooth, for Bluetooth Low Energy (BLE) printers. No extra app.
//  - browser:   the normal print dialog (Windows/Mac PC with the printer driver installed, or any printer).
import { kotDoc, receiptDoc, toEscPos, toHtml } from './receipt';

const KEY = 'wpos.printer';
export const DEFAULT_PRINTER = { method: 'browser', paper: 80, autoPrint: true, kot: false, copies: 1 };

export function getPrinterConfig() {
  try { return { ...DEFAULT_PRINTER, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_PRINTER }; }
}
export function savePrinterConfig(cfg) { localStorage.setItem(KEY, JSON.stringify(cfg)); }

const charsFor = (paper) => (Number(paper) === 58 ? 32 : 48);

// ---------- Bluetooth (BLE) ----------
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];
let bleDevice = null;
let bleChar = null;

export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const bluetoothName = () => bleDevice?.name || null;

async function connectBle() {
  const server = await bleDevice.gatt.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.writeWithoutResponse || ch.properties.write) { bleChar = ch; return; }
    }
  }
  throw new Error('This Bluetooth device has no printable channel');
}

export async function pairBluetooth() {
  if (!bluetoothSupported()) throw new Error('Bluetooth printing needs Chrome on Android or a PC with Bluetooth');
  bleDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
  bleChar = null;
  await connectBle();
  return bleDevice.name;
}

async function bleWrite(bytes) {
  if (!bleDevice) throw new Error('Bluetooth printer not connected. Open Printer settings and tap "Pair printer".');
  if (!bleDevice.gatt.connected || !bleChar) await connectBle();
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (bleChar.properties.writeWithoutResponse) await bleChar.writeValueWithoutResponse(part);
    else await bleChar.writeValue(part);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------- RawBT (Android app) ----------
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function rawbtPrint(bytes) {
  window.location.href = `intent:base64,${toBase64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

// ---------- Browser print dialog ----------
function browserPrint(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  }, 250);
}

export async function sendToPrinter(docs, cfg = getPrinterConfig()) {
  if (cfg.method === 'rawbt') return rawbtPrint(toEscPos(docs));
  if (cfg.method === 'bluetooth') return bleWrite(toEscPos(docs));
  return browserPrint(toHtml(docs, charsFor(cfg.paper)));
}

// Customer bill (+ KOT if enabled). Reprints never include the KOT.
export async function printOrder(order, settings, { provisional = false, reprint = false, kotOnly = false, withKot = true } = {}) {
  const cfg = getPrinterConfig();
  const width = charsFor(cfg.paper);
  const docs = [];
  if (!kotOnly) {
    const copies = Math.max(1, Math.min(3, Number(cfg.copies) || 1));
    for (let i = 0; i < copies; i++) docs.push(receiptDoc(order, settings, { width, provisional, reprint }));
  }
  if (kotOnly || (cfg.kot && withKot && !reprint)) docs.push(kotDoc(order, { width }));
  return sendToPrinter(docs, cfg);
}

export function receiptPreviewLines(order, settings, paper = getPrinterConfig().paper) {
  return receiptDoc(order, settings, { width: charsFor(paper) });
}
