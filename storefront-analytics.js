/* =========================================================
   DSB storefront analytics adapter
   One tiny API for the storefront. No external analytics library is loaded
   here. If Plausible or gtag is added later, this module forwards events;
   otherwise it remains a safe no-op and emits a local diagnostic event.
   ========================================================= */
(function () {
  'use strict';
  const allowed = new Set(['page_view','product_view','search','category_view','filter_change','add_to_cart','begin_checkout','order_completed']);
  function cleanProps(input) {
    const out = {};
    Object.entries(input || {}).slice(0, 16).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (typeof value === 'string') out[key] = value.slice(0, 120);
      else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    });
    return out;
  }
  function track(name, props) {
    if (!allowed.has(name)) return;
    const data = cleanProps(props);
    try {
      if (typeof window.plausible === 'function') window.plausible(name, { props: data });
      else if (typeof window.gtag === 'function') window.gtag('event', name, data);
      document.dispatchEvent(new CustomEvent('dsb:analytics', { detail: { name, props: data } }));
    } catch (_) {}
  }
  function pageView() {
    track('page_view', { path: location.pathname, page: document.title });
  }
  function productView(product) {
    track('product_view', { productId: product?.id, category: product?.category, subcategory: product?.subcategory });
  }
  window.DSBAnalytics = Object.freeze({ track, pageView, productView });
  document.addEventListener('DOMContentLoaded', pageView, { once: true });
})();
