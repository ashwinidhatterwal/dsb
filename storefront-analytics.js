/* =========================================================
   DSB storefront analytics
   Lightweight, anonymous and batched.

   Design rules:
   - First-party events are deliberately small and PII-free.
   - Google receives standard ecommerce events where useful.
   - Analytics is best-effort and must never block shopping/checkout.
   - Campaign attribution is captured once per session, not on every URL change.
   ========================================================= */
(function () {
  'use strict';

  const ALLOWED = new Set(['page_view','product_view','search','category_view','filter_change','add_to_cart','begin_checkout','order_completed','delivery_estimate','review_submitted']);
  const QUEUE_KEY = 'dsb_analytics_queue_v2';
  const VISITOR_KEY = 'dsb_anon_visitor_v1';
  const SESSION_KEY = 'dsb_anon_session_v1';
  const ATTRIBUTION_KEY = 'dsb_attribution_v2';
  const MAX_QUEUE = 60;
  const FLUSH_SIZE = 12;
  const FLUSH_DELAY = 8000;
  const CURRENCY = 'INR';
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

  function clean(value, max) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 100);
  }

  function attribution() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (saved && saved.source) return saved;

      const params = new URLSearchParams(location.search);
      const utmSource = clean(params.get('utm_source'), 80);
      const utmMedium = clean(params.get('utm_medium'), 60);
      const utmCampaign = clean(params.get('utm_campaign'), 100);
      const utmContent = clean(params.get('utm_content'), 100);
      let referrer = '';
      try {
        referrer = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
        if (referrer === location.hostname.replace(/^www\./, '')) referrer = '';
      } catch (_) {}

      const value = {
        source: utmSource || referrer || 'Direct',
        medium: utmMedium || (referrer ? 'referral' : 'direct'),
        campaign: utmCampaign,
        content: utmContent,
        landing: clean(location.pathname || '/', 160)
      };
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
      return value;
    } catch (_) {
      return { source: 'Direct', medium: 'direct', campaign: '', content: '', landing: clean(location.pathname || '/', 160) };
    }
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

  function productById(id) {
    try {
      return Array.isArray(window.ALL_PRODUCTS) ? window.ALL_PRODUCTS.find(p => String(p.id) === String(id)) || null : null;
    } catch (_) { return null; }
  }

  function gaItem(raw) {
    if (!raw) return null;
    const id = clean(raw.id || raw.productId, 80);
    if (!id) return null;
    const known = productById(id) || {};
    const price = Number(raw.unitPrice ?? raw.price ?? known.price);
    const qty = Math.max(1, Math.round(Number(raw.qty || raw.quantity || 1) || 1));
    const item = {
      item_id: id,
      item_name: clean(raw.name || raw.productName || known.name || id, 140),
      item_category: clean(raw.category || known.category, 100),
      item_category2: clean(raw.subcategory || known.subcategory, 100),
      quantity: qty
    };
    if (Number.isFinite(price) && price > 0) item.price = price;
    return item;
  }

  function gaItems(rawItems) {
    return (Array.isArray(rawItems) ? rawItems : []).map(gaItem).filter(Boolean).slice(0, 50);
  }

  function sendGoogleEvent(name, rawProps) {
    if (typeof window.gtag !== 'function') return;
    try {
      // gtag('config', ...) already sends the page_view. Do not duplicate it.
      if (name === 'page_view') return;
      if (name === 'product_view') {
        const item = gaItem(rawProps);
        if (!item) return;
        const payload = { currency: CURRENCY, items: [item] };
        if (Number.isFinite(item.price)) payload.value = item.price;
        window.gtag('event', 'view_item', payload);
        return;
      }
      if (name === 'add_to_cart') {
        const item = gaItem(rawProps);
        if (!item) return;
        const payload = { currency: CURRENCY, items: [item] };
        if (Number.isFinite(item.price)) payload.value = item.price * (item.quantity || 1);
        window.gtag('event', 'add_to_cart', payload);
        return;
      }
      if (name === 'begin_checkout') {
        const items = gaItems(rawProps?.cartItems);
        const payload = { currency: CURRENCY, items };
        const total = Number(rawProps?.total);
        if (Number.isFinite(total) && total >= 0) payload.value = total;
        window.gtag('event', 'begin_checkout', payload);
        return;
      }
      if (name === 'order_completed') {
        const items = gaItems(rawProps?.cartItems);
        const payload = {
          transaction_id: clean(rawProps?.transactionId, 100),
          currency: CURRENCY,
          value: Math.max(0, Number(rawProps?.total) || 0),
          items
        };
        window.gtag('event', 'purchase', payload);
        return;
      }
      // Keep other useful storefront interactions as lightweight custom events.
      window.gtag('event', name, cleanProps(rawProps));
    } catch (_) {}
  }

  function readQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE).map(item => ({ ...item, qid: item?.qid || randomId() })) : [];
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
    writeQueue(queue);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'analyticsBatch', visitorId, sessionId, events: chunk }),
        keepalive: !!options?.keepalive
      });
      if (!response.ok) throw new Error('analytics http ' + response.status);
      const data = await response.json();
      if (data && data.success !== false && !data.busy && !data.throttled) {
        const sent = new Set(chunk.map(item => item.qid));
        writeQueue(readQueue().filter(item => !sent.has(item.qid)));
      }
    } catch (_) {
      // Analytics is intentionally best-effort. It must never interrupt shopping.
    } finally {
      flushing = false;
      if (readQueue().length) scheduleFlush(12000);
    }
  }

  function track(name, props) {
    if (!ALLOWED.has(name)) return;
    try {
      sendGoogleEvent(name, props || {});
      const data = cleanProps(props);
      const attr = attribution();
      const queue = readQueue();
      queue.push({
        qid: randomId(),
        name,
        ts: new Date().toISOString(),
        path: location.pathname,
        trafficSource: attr.source,
        trafficMedium: attr.medium,
        trafficCampaign: attr.campaign,
        trafficContent: attr.content,
        landing: attr.landing,
        device: deviceType(),
        props: data
      });
      writeQueue(queue);
      document.dispatchEvent(new CustomEvent('dsb:analytics', { detail: { name, props: data } }));
      if (queue.length >= FLUSH_SIZE) flush(); else scheduleFlush();
    } catch (_) {}
  }

  function pageView() {
    track('page_view', { path: location.pathname, trafficSource: attribution().source, device: deviceType() });
  }

  function productView(product) {
    track('product_view', {
      productId: product?.id,
      productName: product?.name,
      category: product?.category,
      subcategory: product?.subcategory,
      price: Number(product?.price || 0)
    });
  }

  window.DSBAnalytics = Object.freeze({ track, pageView, productView, flush });
  document.addEventListener('DOMContentLoaded', pageView, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ keepalive: true }); });
})();
