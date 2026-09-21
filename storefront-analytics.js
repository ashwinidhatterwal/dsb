/* =========================================================
   DSB storefront analytics
   Lightweight, anonymous and batched. Events are sent to the existing Apps
   Script endpoint in small batches; no names, phone numbers, addresses,
   order IDs or raw search text are collected here.
   ========================================================= */
(function () {
  'use strict';
  const ALLOWED = new Set(['page_view','product_view','search','category_view','filter_change','add_to_cart','begin_checkout','order_completed','delivery_estimate','review_submitted']);
  const QUEUE_KEY = 'dsb_analytics_queue_v2';
  const VISITOR_KEY = 'dsb_anon_visitor_v1';
  const SESSION_KEY = 'dsb_anon_session_v1';
  const SOURCE_KEY = 'dsb_traffic_source_v1';
  const MAX_QUEUE = 60;
  const FLUSH_SIZE = 12;
  const FLUSH_DELAY = 8000;
  let flushTimer = 0;
  let flushing = false;

  function randomId() {
    try { return crypto.randomUUID(); } catch (_) { return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); }
  }
  function storageId(storage, key) {
    try {
      let value = storage.getItem(key);
      if (!value) { value = randomId(); storage.setItem(key, value); }
      return value;
    } catch (_) { return randomId(); }
  }
  const visitorId = storageId(localStorage, VISITOR_KEY);
  const sessionId = storageId(sessionStorage, SESSION_KEY);

  function trafficSource() {
    try {
      const existing = sessionStorage.getItem(SOURCE_KEY);
      if (existing) return existing;
      const params = new URLSearchParams(location.search);
      const utm = String(params.get('utm_source') || '').trim();
      let source = utm ? utm.slice(0, 80) : '';
      if (!source && document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (host && host !== location.hostname.replace(/^www\./, '')) source = host;
      }
      if (!source) source = 'Direct';
      sessionStorage.setItem(SOURCE_KEY, source);
      return source;
    } catch (_) { return 'Direct'; }
  }
  function deviceType() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    return width <= 760 ? 'Mobile' : width <= 1100 ? 'Tablet' : 'Desktop';
  }
  function cleanProps(input) {
    const out = {};
    const safeKeys = new Set(['path','productId','category','subcategory','filter','value','source','payment','total','items','results','verified','trafficSource','device']);
    Object.entries(input || {}).slice(0, 18).forEach(([key, value]) => {
      if (!safeKeys.has(key) || value === undefined || value === null || value === '') return;
      if (typeof value === 'string') out[key] = value.slice(0, 120);
      else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    });
    return out;
  }
  function readQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
    } catch (_) { return []; }
  }
  function writeQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch (_) {}
  }
  function endpoint() {
    try { return typeof CONFIG !== 'undefined' && CONFIG.SHEET_API_URL ? String(CONFIG.SHEET_API_URL) : ''; } catch (_) { return ''; }
  }
  function scheduleFlush(delay) {
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => flush(), typeof delay === 'number' ? delay : FLUSH_DELAY);
  }
  async function flush(options) {
    if (flushing) return;
    const url = endpoint();
    if (!url) return;
    const queue = readQueue();
    if (!queue.length) return;
    flushing = true;
    const chunk = queue.slice(0, FLUSH_SIZE);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'analyticsBatch', visitorId, sessionId, events: chunk }),
        keepalive: !!options?.keepalive
      });
      if (!response.ok) throw new Error('analytics http ' + response.status);
      const data = await response.json();
      if (data && data.success !== false) writeQueue(queue.slice(chunk.length));
    } catch (_) {
      // Analytics is intentionally best-effort. It must never interrupt shopping.
    } finally {
      flushing = false;
      if (readQueue().length) scheduleFlush(12000);
    }
  }
  function track(name, props) {
    if (!ALLOWED.has(name)) return;
    const data = cleanProps(props);
    try {
      if (typeof window.plausible === 'function') window.plausible(name, { props: data });
      else if (typeof window.gtag === 'function') window.gtag('event', name, data);
      const queue = readQueue();
      queue.push({ name, ts: new Date().toISOString(), path: location.pathname, trafficSource: trafficSource(), device: deviceType(), props: data });
      writeQueue(queue);
      document.dispatchEvent(new CustomEvent('dsb:analytics', { detail: { name, props: data } }));
      if (queue.length >= FLUSH_SIZE) flush(); else scheduleFlush();
    } catch (_) {}
  }
  function pageView() {
    track('page_view', { path: location.pathname, trafficSource: trafficSource(), device: deviceType() });
  }
  function productView(product) {
    track('product_view', { productId: product?.id, category: product?.category, subcategory: product?.subcategory });
  }
  window.DSBAnalytics = Object.freeze({ track, pageView, productView, flush });
  document.addEventListener('DOMContentLoaded', pageView, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ keepalive: true }); });
})();
