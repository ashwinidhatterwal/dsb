/* =========================================================
   Dhatterwal Suhag Bhandar — shared cart drawer + checkout
   Used by both index.html and product.html.
   ========================================================= */

// Checkout form state lives here (not just in the DOM) so it survives the
// drawer re-rendering itself — e.g. adjusting a quantity used to silently
// wipe out anything already typed into the name/phone fields. Name, phone,
// and address are also persisted to localStorage so they survive navigating
// between pages (each is a full page load, which would otherwise reset
// this object back to empty every time).
const CHECKOUT_INFO_KEY = 'dsb_checkout_info_v1';
function loadSavedCheckoutInfo() {
  try {
    const raw = localStorage.getItem(CHECKOUT_INFO_KEY);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) {
    return {};
  }
}
function saveCheckoutInfo() {
  try {
    localStorage.setItem(CHECKOUT_INFO_KEY, JSON.stringify({
      name: checkoutState.name,
      phone: checkoutState.phone,
      address: checkoutState.address,
      pinCode: checkoutState.pinCode
    }));
  } catch (e) {/* storage unavailable — details just won't persist, nothing breaks */}
}
const savedCheckoutInfo = loadSavedCheckoutInfo();
const checkoutState = {
  name: savedCheckoutInfo.name || '',
  phone: savedCheckoutInfo.phone || '',
  address: savedCheckoutInfo.address || '',
  pinCode: savedCheckoutInfo.pinCode || '',
  paymentMethod: CONFIG.UPI_ID ? 'UPI' : 'COD',
  promoInput: '',
  appliedPromo: null,
  // { code, type, value }
  promoStatus: '',
  availablePromos: null,
  // fetched once per page load, cached here
  feeConfig: null // authoritative checkout fee policy from Apps Script
};
let lastReceipt = null;
let cartAdjustments = {
  removed: [],
  adjusted: []
};
function updateCartBadge() {
  const badge = $('#cartBadge');
  if (!badge) return;

  const count = CartStore.count();
  const prevCount = Number(badge.dataset.count) || 0;
  const trigger = $('#cartTrigger');

  badge.dataset.count = String(count);
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('is-hidden', count === 0);

  if (trigger) {
    trigger.setAttribute('aria-label', count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart');
  }

  if (count > prevCount) {
    badge.classList.remove('bump');
    void badge.offsetWidth; // restart the animation even if it's already mid-play
    badge.classList.add('bump');
  }
}
// Success feedback is local and never gates cart state or opening checkout.
function playAddFlourish(anchor, { openCartAfter = false } = {}) {
  updateCartBadge();
  window.DSBFeedback?.celebrate(anchor);
  if (openCartAfter) openCart();
}

/* ---------------- Track your order ---------------- */
function openTrackOrder(prefillOrderId) {
  const overlay = $('#trackOverlay');
  if (!overlay) return;
  closeCart();
  overlay.classList.add('open');
  $('#trackForm').style.display = 'block';
  $('#trackResult').style.display = 'none';
  $('#trackError').style.display = 'none';
  const idField = $('#trackOrderId');
  if (prefillOrderId) idField.value = prefillOrderId;
  openDialogFocus(overlay, closeTrackOrder);
  // If we already know the order ID, send focus to the phone field instead —
  // that's the one thing left for the customer to type.
  (prefillOrderId ? $('#trackPhone') : idField)?.focus();
}
function closeTrackOrder() {
  const overlay = $('#trackOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    closeDialogFocus(overlay);
  }
}
function showTrackError(msg) {
  const el = $('#trackError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
async function submitTrackOrder() {
  const orderId = ($('#trackOrderId').value || '').trim();
  const phone = ($('#trackPhone').value || '').trim();
  $('#trackError').style.display = 'none';
  if (!orderId || !phone) {
    showTrackError('Please enter both your Order ID and phone number.');
    return;
  }
  if (!CONFIG.SHEET_API_URL) {
    showTrackError("Order tracking isn't set up yet — message us on WhatsApp for your order status.");
    return;
  }
  const btn = $('#trackSubmitBtn');
  const originalLabel = btn.textContent;
  setButtonBusy(btn, true);
  btn.textContent = 'Checking…';
  try {
    const url = `${CONFIG.SHEET_API_URL}?action=trackOrder&orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`;
    const data = await requestJson(url);
    if (!data || !data.success) {
      showTrackError("We couldn't find a matching order. Double-check the Order ID and phone number, or message us on WhatsApp.");
      return;
    }
    renderTrackResult(data);
  } catch (err) {
    showTrackError('Something went wrong — please try again or message us on WhatsApp.');
  } finally {
    setButtonBusy(btn, false);
    btn.textContent = originalLabel;
  }
}
function renderTrackResult(o) {
  $('#trackForm').style.display = 'none';
  const wrap = $('#trackResult');
  wrap.style.display = 'block';
  const status = String(o.status || 'Pending').trim();
  const statusLower = status.toLowerCase();
  const isCancelled = statusLower === 'cancelled';
  const stages = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
  const current = status === 'Fulfilled' ? 4 : stages.indexOf(status);
  const labels = ['Order received', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
  const stepsHtml = isCancelled ? '<div class="track-steps cancelled"><div class="track-step done"><span class="dot"></span>Order received</div><div class="track-step cancel"><span class="dot"></span>Cancelled</div></div>' : `<ol class="track-steps track-timeline">${labels.map((label, i) => `<li class="track-step ${i <= current ? 'done' : ''} ${i === current && current < 4 ? 'active' : ''}" ${i === current ? 'aria-current="step"' : ''}><span class="dot"></span>${label}</li>`).join('')}</ol>`;
  const waText = encodeURIComponent(`Hi, I have a question about my order ${o.orderId}`);
  wrap.innerHTML = `
    <button class="ghost-btn" id="trackAnotherBtn" style="margin-bottom:14px;">← Track another order</button>
    <div class="track-card">
      <div class="track-card-head">
        <div>
          <div class="track-oid">${escapeHtml(o.orderId)}</div>
          <div class="track-odate">${escapeHtml(formatDateTime(o.date))}</div>
        </div>
        <span class="status-pill ${escapeHtml(statusLower)}">${escapeHtml(status)}</span>
      </div>
      ${stepsHtml}
      <div class="track-details">
        ${o.items ? `<div class="row"><span>Items</span><span style="text-align:right; max-width:60%;">${escapeHtml(o.items)}</span></div>` : ''}
        ${Number(o.discount) > 0 ? `<div class="row"><span>Discount</span><span>−${money(o.discount)}</span></div>` : ''}
        ${Number(o.deliveryCharge) > 0 ? `<div class="row"><span>Delivery</span><span>${money(o.deliveryCharge)}</span></div>` : ''}
        ${Number(o.codCharge) > 0 ? `<div class="row"><span>COD fee</span><span>${money(o.codCharge)}</span></div>` : ''}
        <div class="row total"><span>Total</span><span>${money(o.total)}</span></div>
        ${o.paymentMethod ? `<div class="row"><span>Payment</span><span>${escapeHtml(o.paymentMethod)}</span></div>` : ''}
      </div>
      <a class="primary-btn whatsapp-btn" style="width:100%; margin-top:14px; text-decoration:none;" href="https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${waText}" target="_blank" rel="noopener">📲 Ask about this order</a>
    </div>
  `;
  $('#trackAnotherBtn').addEventListener('click', () => openTrackOrder());
}
document.addEventListener('DOMContentLoaded', () => {
  const trigger = $('#trackOrderTrigger');
  const heroTrigger = $('#heroTrackBtn');
  const closeBtn = $('#trackOverlayClose');
  const submitBtn = $('#trackSubmitBtn');
  const overlay = $('#trackOverlay');
  if (trigger) trigger.addEventListener('click', () => openTrackOrder());
  if (heroTrigger) heroTrigger.addEventListener('click', () => openTrackOrder());
  if (closeBtn) closeBtn.addEventListener('click', closeTrackOrder);
  if (submitBtn) submitBtn.addEventListener('click', submitTrackOrder);
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target.id === 'trackOverlay') closeTrackOrder();
  });
});
let cartScrollLockY = 0;
function lockPageForCart() {
  // position:fixed is more reliable than overflow:hidden on Android browsers.
  if (document.body.classList.contains('modal-open')) return;
  cartScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${cartScrollLockY}px`;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}
function unlockPageFromCart() {
  if (!document.body.classList.contains('modal-open')) return;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo({ top: cartScrollLockY, left: 0, behavior: 'instant' });
}
async function openCart() {
  // Reconcile against the live catalog if one is loaded on this page (it
  // won't be on About/Contact, which never fetch products — safe no-op there).
  if (typeof ALL_PRODUCTS !== 'undefined' && ALL_PRODUCTS.length && (typeof CATALOG_META === 'undefined' || CATALOG_META.source === 'live')) {
    const changes = await CartStore.syncSafe(ALL_PRODUCTS);
    if (changes.removed.length || changes.adjusted.length) cartAdjustments = changes;
  }
  renderCartDrawer();
  if (CartStore.takeRepairNotice()) showToast('Some saved cart data was damaged and has been removed.');
  lockPageForCart();
  $('#cartOverlay').classList.add('open');
  openDialogFocus($('#cartContent'), closeCart);
  fetchPromosIfNeeded();
  fetchCheckoutConfigIfNeeded().then(() => {
    if ($('#cartOverlay')?.classList.contains('open') && !checkoutBusy && !checkoutQuote && !pendingCheckout && !$('#downloadReceiptBtn')) renderCartDrawer();
  });
}
function closeCart() {
  $('#cartOverlay').classList.remove('open');
  closeDialogFocus($('#cartContent'));
  unlockPageFromCart();
}

/* ---------------- Promo codes ---------------- */
async function fetchPromosIfNeeded() {
  if (checkoutState.availablePromos !== null) return; // already fetched this page load
  if (!CONFIG.SHEET_API_URL) {
    checkoutState.availablePromos = [];
    return;
  }
  try {
    const data = await loadPublicPromos();
    if (!Array.isArray(data)) throw new Error('Invalid promo response');
    checkoutState.availablePromos = data;
  } catch (err) {
    checkoutState.availablePromos = null;
  }
}
let promoBusy = false;
async function applyPromoCode() {
  if (promoBusy) return;
  const button = $('#applyPromoBtn');
  promoBusy = true;
  setButtonBusy(button, true);
  try {
    await applyPromoCodeTask();
  } finally {
    promoBusy = false;
    setButtonBusy(button, false);
  }
}
async function applyPromoCodeTask() {
  if (checkoutState.availablePromos === null) {
    await fetchPromosIfNeeded();
  }
  if (checkoutState.availablePromos === null) {
    checkoutState.promoStatus = 'Could not check promo codes. Please try again.';
    renderCartDrawer();
    return;
  }
  const typed = checkoutState.promoInput.trim();
  if (!typed) {
    checkoutState.promoStatus = 'Enter a code first.';
    checkoutState.appliedPromo = null;
    renderCartDrawer();
    return;
  }
  const list = checkoutState.availablePromos || [];
  const match = list.find(p => p.code.toLowerCase() === typed.toLowerCase());
  if (!match) {
    checkoutState.appliedPromo = null;
    checkoutState.promoStatus = 'That code isn\'t valid.';
  } else {
    checkoutState.appliedPromo = match;
    checkoutState.promoStatus = match.type === 'percent' ? `Applied — ${match.value}% off` : `Applied — ₹${match.value} off`;
  }
  renderCartDrawer();
}
function computeDiscount(subtotal) {
  const promo = checkoutState.appliedPromo;
  if (!promo) return 0;
  const raw = promo.type === 'percent' ? subtotal * (promo.value / 100) : promo.value;
  return Math.round(Math.min(Math.max(raw, 0), subtotal) * 100) / 100;
}
async function fetchCheckoutConfigIfNeeded() {
  if (checkoutState.feeConfig !== null) return checkoutState.feeConfig;
  if (!CONFIG.SHEET_API_URL) return null;
  try {
    const data = await (typeof cachedPublicJson === 'function' ? cachedPublicJson('checkout-config', `${CONFIG.SHEET_API_URL}?action=checkoutConfig`, 60000) : requestJson(`${CONFIG.SHEET_API_URL}?action=checkoutConfig`));
    if (data.checkoutVersion !== 2) throw new Error('Checkout update required.');
    if (!['deliveryFreeAbove', 'deliveryCharge', 'codCharge'].every(k => Number.isFinite(Number(data[k])) && Number(data[k]) >= 0)) throw new Error('Invalid checkout settings.');
    checkoutState.feeConfig = data;
  } catch (err) {/* Keep fees unknown, never silently treat a failed request as free delivery. */}
  return checkoutState.feeConfig;
}
function computeCheckoutTotals(subtotal) {
  const discount = computeDiscount(subtotal);
  const merchandiseTotal = Math.round(Math.max(0, subtotal - discount) * 100) / 100;
  const cfg = checkoutState.feeConfig || {
    deliveryFreeAbove: 0,
    deliveryCharge: 0,
    codCharge: 0
  };
  const deliveryCharge = cfg.deliveryCharge > 0 && merchandiseTotal < cfg.deliveryFreeAbove ? cfg.deliveryCharge : 0;
  const codCharge = checkoutState.paymentMethod === 'COD' ? cfg.codCharge : 0;
  return {
    discount,
    merchandiseTotal,
    deliveryCharge,
    codCharge,
    grandTotal: Math.round((merchandiseTotal + deliveryCharge + codCharge) * 100) / 100
  };
}

/* ---------------- UPI ---------------- */
function buildUpiLink(amount, orderId) {
  const params = new URLSearchParams({
    pa: CONFIG.UPI_ID,
    pn: CONFIG.UPI_PAYEE_NAME || CONFIG.SHOP_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: orderId ? `Order ${orderId}` : `Order at ${CONFIG.SHOP_NAME}`,
    ...(orderId ? {
      tr: orderId
    } : {})
  });
  return `upi://pay?${params.toString()}`;
}

