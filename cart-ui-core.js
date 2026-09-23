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
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Refined add-to-cart motion: a small product token glides toward the cart
// while the cart and badge respond with restrained micro-interactions.
function flyToCart(imgEl, onLand) {
  const fallback = () => { if (onLand) onLand(); };
  if (!imgEl || prefersReducedMotion()) { fallback(); return; }
  const cartIcon = $('#cartTrigger');
  if (!cartIcon) { fallback(); return; }
  const startRect = imgEl.getBoundingClientRect();
  const endRect = cartIcon.getBoundingClientRect();
  if (!startRect.width || !endRect.width) { fallback(); return; }

  const size = 22;
  const startX = startRect.right - size - 10;
  const startY = startRect.bottom - size - 10;
  const token = document.createElement('div');
  token.className = 'cart-flight-token';
  token.style.cssText = `left:${startX}px;top:${startY}px;width:${size}px;height:${size}px;background-image:url("${String(imgEl.currentSrc || imgEl.src || '').replace(/"/g, '%22')}")`;
  document.body.appendChild(token);

  const dx = endRect.left + endRect.width / 2 - (startX + size / 2);
  const dy = endRect.top + endRect.height / 2 - (startY + size / 2);
  const curve = Math.min(54, Math.max(24, Math.abs(dx) * .08));
  const frames = [
    { transform:'translate3d(0,0,0) scale(1)', opacity:.94, offset:0 },
    { transform:`translate3d(${dx*.46}px,${dy*.46-curve}px,0) scale(.86)`, opacity:.9, offset:.46 },
    { transform:`translate3d(${dx}px,${dy}px,0) scale(.48)`, opacity:.2, offset:1 }
  ];
  const anim = token.animate(frames, { duration:430, easing:'cubic-bezier(.22,.72,.22,1)' });
  anim.onfinish = () => {
    token.remove();
    cartIcon.classList.remove('cart-settle');
    void cartIcon.offsetWidth;
    cartIcon.classList.add('cart-settle');
    if (onLand) onLand();
  };
  anim.oncancel = () => token.remove();
}

// Shared "fly into the cart, then react" sequencing used by every Add/Buy
// Now button across the site — keeps the cart badge bump and (optionally)
// opening the drawer in sync with the moment the product actually "lands".
function playAddFlourish(imgEl, {
  openCartAfter = false
} = {}) {
  const finish = () => {
    updateCartBadge();
    if (openCartAfter) openCart();
  };
  flyToCart(imgEl, finish);
}

/* ---------------- Order tracking navigation ---------------- */
function trackOrderUrl(orderId) {
  const id = String(orderId || '').trim();
  return id ? `track-order.html?orderId=${encodeURIComponent(id)}` : 'track-order.html';
}
function goToTrackOrder(orderId) {
  window.location.href = trackOrderUrl(orderId);
}

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
  window.scrollTo(0, cartScrollLockY);
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
async function applyPromoCode() {
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


function forgetSavedCheckoutInfo() {
  try { localStorage.removeItem(CHECKOUT_INFO_KEY); } catch (_) {}
  ['name','phone','address','pinCode'].forEach(key=>checkoutState[key]='');
  checkoutQuote = null;
  renderCartDrawer();
  showToast('Saved checkout details cleared.');
}
