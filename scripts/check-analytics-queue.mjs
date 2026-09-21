import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('../storefront-analytics.js', import.meta.url), 'utf8');
class Storage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
}
const localStorage = new Storage(), sessionStorage = new Storage();
let resolveFetch;
const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
const listeners = new Map();
let id = 0;
const context = vm.createContext({
  console,
  localStorage, sessionStorage,
  location: { pathname: '/index.html', search: '', hostname: 'example.test' },
  document: {
    referrer: '', documentElement: { clientWidth: 390 }, visibilityState: 'visible',
    addEventListener(name, fn){ listeners.set(name, fn); },
    dispatchEvent(){}
  },
  window: {
    innerWidth: 390,
    setTimeout(){ return ++id; },
    clearTimeout(){},
  },
  clearTimeout(){},
  crypto: { randomUUID(){ return `id-${++id}`; } },
  CustomEvent: class { constructor(type, init){ this.type=type; this.detail=init?.detail; } },
  CONFIG: { SHEET_API_URL: 'https://example.test/api' },
  fetch(){ return fetchPromise; },
  Set, Map, JSON, Date, Math, URL, URLSearchParams, Object, Array, String, Number, Boolean, Promise,
});
context.window.window = context.window;
context.window.DSBAnalytics = undefined;
context.window.setTimeout = context.window.setTimeout.bind(context.window);
context.window.clearTimeout = context.window.clearTimeout.bind(context.window);
// The script accesses window.DSBAnalytics but free globals for storage/document.
vm.runInContext(source, context);
const api = context.window.DSBAnalytics;
assert(api, 'Analytics API should initialize');
for (let i = 0; i < 12; i++) api.track('page_view', { path: '/p' + i });
// The 12th event starts a flush whose fetch is intentionally held open.
api.track('add_to_cart', { productId: 'DSB-TEST' });
let queued = JSON.parse(localStorage.getItem('dsb_analytics_queue_v2'));
assert.equal(queued.length, 13, 'New event should be queued while prior batch is in flight');
resolveFetch({ ok: true, async json(){ return { success: true, accepted: 12 }; } });
await Promise.resolve(); await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
queued = JSON.parse(localStorage.getItem('dsb_analytics_queue_v2'));
assert.equal(queued.length, 1, 'Successful flush must preserve event added during the request');
assert.equal(queued[0].name, 'add_to_cart');
console.log('PASS: analytics in-flight flush preserves newly queued events.');
