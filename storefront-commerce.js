/* =========================================================
   DSB storefront commerce helpers
   Owns customer-facing assurance copy, recently-viewed storage and
   deterministic similar-product ranking. Keeps these rules out of page files.
   ========================================================= */
(function () {
  'use strict';
  const RECENT_KEY = 'dsb_recent_products_v1';
  const RECENT_LIMIT = 12;
  function readRecentIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(ids) ? ids.filter(Boolean).map(String).slice(0, RECENT_LIMIT) : [];
    } catch (_) { return []; }
  }
  function rememberViewed(product) {
    const id = String(product?.id || '').trim();
    if (!id) return;
    try {
      const ids = [id, ...readRecentIds().filter(x => x !== id)].slice(0, RECENT_LIMIT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
    } catch (_) {}
  }
  function recentProducts(products, excludeId, limit = 8) {
    const map = new Map((products || []).map(p => [String(p.id), p]));
    return readRecentIds().filter(id => id !== String(excludeId || '')).map(id => map.get(id)).filter(Boolean).slice(0, limit);
  }
  function tokenSet(value) {
    return new Set(String(value || '').toLowerCase().split(/[\s,;/|]+/).map(x => x.trim()).filter(Boolean));
  }
  function overlap(a, b) {
    let score = 0;
    for (const x of a) if (b.has(x)) score++;
    return score;
  }
  function similarProducts(product, products, limit = 8) {
    const sourceTags = tokenSet(product?.tags);
    const sourceWords = tokenSet([product?.name, product?.subcategory, product?.material, product?.specifications].filter(Boolean).join(' '));
    const sourceSizes = tokenSet(Array.isArray(product?.sizes) ? product.sizes.join(' ') : product?.sizes);
    const base = Number(window.DSB_SEO?.pricing?.(product)?.min || product.price || 0);
    return (products || []).filter(candidate => candidate.id !== product.id && !isOutOfStock(candidate)).map(candidate => {
      let score = 0;
      if (candidate.subcategory && candidate.subcategory === product.subcategory) score += 14;
      if (candidate.category && candidate.category === product.category) score += 7;
      if (candidate.material && product.material && String(candidate.material).toLowerCase() === String(product.material).toLowerCase()) score += 4;
      score += overlap(sourceTags, tokenSet(candidate.tags)) * 3;
      score += Math.min(4, overlap(sourceWords, tokenSet([candidate.name, candidate.subcategory, candidate.material, candidate.specifications].filter(Boolean).join(' '))));
      score += Math.min(2, overlap(sourceSizes, tokenSet(Array.isArray(candidate.sizes) ? candidate.sizes.join(' ') : candidate.sizes)));
      const price = Number(window.DSB_SEO?.pricing?.(candidate)?.min || candidate.price || 0);
      if (base > 0 && price > 0) {
        const distance = Math.abs(price - base) / base;
        if (distance <= 0.20) score += 4;
        else if (distance <= 0.40) score += 2;
      }
      return { candidate, score };
    }).sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id))).slice(0, limit).map(x => x.candidate);
  }
  function detailRows(product) {
    const rows = [];
    if (product?.id) rows.push(['Product ID', product.id]);
    if (product?.category) rows.push(['Category', product.category]);
    if (product?.subcategory) rows.push(['Type', product.subcategory]);
    if (Array.isArray(product?.sizes) && product.sizes.length) rows.push(['Available sizes', product.sizes.join(', ')]);
    const pricing = window.DSB_SEO?.pricing?.(product);
    if (pricing && Number.isFinite(pricing.min) && Number.isFinite(pricing.max) && pricing.min !== pricing.max) {
      rows.push(['Price range', `₹${pricing.min.toFixed(0)}–₹${pricing.max.toFixed(0)}`]);
    }
    (window.DSB_SEO?.details?.(product) || []).forEach(row => {
      if (!rows.some(existing => existing[0] === row[0])) rows.push(row);
    });
    return rows;
  }
  function deliveryEstimatorHtml() {
    let saved = '';
    try { saved = localStorage.getItem('dsb_delivery_pin') || ''; } catch (_) {}
    return `<section class="delivery-estimator" aria-label="Delivery estimate">
      <div><strong>Check delivery estimate</strong><span>Enter your 6-digit PIN code for a shop estimate.</span></div>
      <form class="delivery-estimator-form" id="deliveryEstimatorForm">
        <input id="deliveryEstimatorPin" inputmode="numeric" autocomplete="postal-code" maxlength="6" pattern="[1-9][0-9]{5}" placeholder="PIN code" value="${saved.replace(/[^0-9]/g,'').slice(0,6)}">
        <button type="submit" class="ghost-btn">Check</button>
      </form>
      <div class="delivery-estimator-result" id="deliveryEstimatorResult" aria-live="polite"></div>
    </section>`;
  }
  function bindDeliveryEstimator() {
    const form = document.getElementById('deliveryEstimatorForm');
    const input = document.getElementById('deliveryEstimatorPin');
    const result = document.getElementById('deliveryEstimatorResult');
    if (!form || !input || !result || typeof CONFIG === 'undefined' || !CONFIG.SHEET_API_URL) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const pin = String(input.value || '').replace(/\D/g, '').slice(0,6);
      if (!/^[1-9][0-9]{5}$/.test(pin)) {
        result.textContent = 'Enter a valid 6-digit PIN code.';
        result.className = 'delivery-estimator-result err';
        return;
      }
      result.textContent = 'Checking…';
      result.className = 'delivery-estimator-result';
      try {
        const data = await requestJson(`${CONFIG.SHEET_API_URL}?action=deliveryEstimate&pinCode=${encodeURIComponent(pin)}`);
        if (!data?.success) throw new Error(data?.error || 'Estimate unavailable.');
        try { localStorage.setItem('dsb_delivery_pin', pin); } catch (_) {}
        result.innerHTML = `<strong>${data.minDays}–${data.maxDays} business days</strong><span>${data.label}. ${data.note}</span>`;
        result.className = 'delivery-estimator-result ok';
        window.DSBAnalytics?.track('delivery_estimate', { pinPrefix: pin.slice(0,3) });
      } catch (err) {
        result.textContent = err.message || 'Could not check delivery right now.';
        result.className = 'delivery-estimator-result err';
      }
    });
  }
  function assuranceHtml(product) {
    const sized = Array.isArray(product?.sizes) && product.sizes.length;
    return `<section class="commerce-assurance" aria-label="Shopping information">
      <a class="assurance-item" href="returns.html"><strong>Returns & exchanges</strong><span>Read the shop policy before ordering.</span></a>
      <div class="assurance-item"><strong>Delivery checked at checkout</strong><span>Charges and availability are confirmed before your order is saved.</span></div>
      <div class="assurance-item"><strong>UPI & Cash on Delivery</strong><span>Available payment methods are shown during checkout.</span></div>
      <a class="assurance-item" href="contact.html"><strong>Need help?</strong><span>Contact the shop for product, size${sized ? '' : ' or'} delivery questions.</span></a>
    </section>`;
  }
  window.DSBCommerce = Object.freeze({ rememberViewed, recentProducts, similarProducts, detailRows, assuranceHtml, deliveryEstimatorHtml, bindDeliveryEstimator, readRecentIds });
})();
