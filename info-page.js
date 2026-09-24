/* Lightweight bootstrap for informational storefront pages.
 * Keeps checkout/drawer code off the critical path and loads it only when
 * the customer actually opens the cart. Requires config.js, utils.js,
 * cart.js and products-data.js.
 */
(() => {
  'use strict';
  let cartUiPromise = null;

  function lightweightCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge || typeof CartStore === 'undefined') return;
    const count = CartStore.count();
    badge.dataset.count = String(count);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('is-hidden', count === 0);
    const trigger = document.getElementById('cartTrigger');
    if (trigger) trigger.setAttribute('aria-label', count ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lazy-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.lazySrc = src;
      script.onload = () => { script.dataset.loaded = '1'; resolve(); };
      script.onerror = () => reject(new Error('Could not load cart UI.'));
      document.body.appendChild(script);
    });
  }

  function ensureCartUi() {
    if (typeof window.openCart === 'function') return Promise.resolve();
    if (!cartUiPromise) {
      cartUiPromise = loadScript('customer-account.js?v=20260924customers2')
        .then(() => loadScript('cart-ui-core.js?v=20260924customers2'))
        .then(() => loadScript('cart-ui-drawer.js?v=20260924customers2'))
        .then(() => loadScript('cart-ui-checkout.js?v=20260924customers2'))
        .catch(err => { cartUiPromise = null; throw err; });
    }
    return cartUiPromise;
  }

  async function openLazyCart() {
    const trigger = document.getElementById('cartTrigger');
    if (trigger) trigger.setAttribute('aria-busy', 'true');
    try {
      await ensureCartUi();
      await window.openCart();
    } catch (_) {
      if (typeof showToast === 'function') showToast('Could not open the cart. Please try again.');
    } finally {
      if (trigger) trigger.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchTrigger')?.addEventListener('click', () => { location.href = 'index.html?search=1'; });
    document.getElementById('cartTrigger')?.addEventListener('click', openLazyCart);
    document.getElementById('cartOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'cartOverlay' && typeof window.closeCart === 'function') window.closeCart();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && typeof window.closeCart === 'function') window.closeCart();
    });
    document.addEventListener('dsb:cartchange', lightweightCartBadge);
    lightweightCartBadge();
    if (typeof initWhatsAppFloat === 'function') initWhatsAppFloat();
  });
})();
