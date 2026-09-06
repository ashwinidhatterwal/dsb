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

function loadSavedCheckoutInfo(){
  try{
    const raw = localStorage.getItem(CHECKOUT_INFO_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e){ return {}; }
}

function saveCheckoutInfo(){
  try{
    localStorage.setItem(CHECKOUT_INFO_KEY, JSON.stringify({
      name: checkoutState.name, phone: checkoutState.phone, address: checkoutState.address
    }));
  } catch(e){ /* storage unavailable — details just won't persist, nothing breaks */ }
}

const savedCheckoutInfo = loadSavedCheckoutInfo();
const checkoutState = {
  name: savedCheckoutInfo.name || '',
  phone: savedCheckoutInfo.phone || '',
  address: savedCheckoutInfo.address || '',
  paymentMethod: 'COD',
  promoInput: '',
  appliedPromo: null,   // { code, type, value }
  promoStatus: '',
  availablePromos: null, // fetched once per page load, cached here
  feeConfig: null         // authoritative checkout fee policy from Apps Script
};

let lastReceipt = null;

function updateCartBadge(){
  const badge = $('#cartBadge');
  if (!badge) return;
  const prevCount = Number(badge.textContent) || 0;
  const count = CartStore.count();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
  if (count > prevCount){
    badge.classList.remove('bump');
    void badge.offsetWidth; // restart the animation even if it's already mid-play
    badge.classList.add('bump');
  }
}

function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Animates a round clone of a product photo flying — slowly, continuously
// shrinking, accelerating toward the end — into the cart icon, where it
// gets "swallowed" with a gulp-like bounce. Falls back to just calling
// onLand() immediately if the browser prefers less motion, or if anything
// needed for the animation isn't available.
function flyToCart(imgEl, onLand){
  const fallback = () => { if (onLand) onLand(); };
  if (!imgEl || prefersReducedMotion()) { fallback(); return; }
  const cartIcon = $('#cartTrigger');
  if (!cartIcon) { fallback(); return; }
  const startRect = imgEl.getBoundingClientRect();
  const endRect = cartIcon.getBoundingClientRect();
  if (!startRect.width || !endRect.width) { fallback(); return; }

  const size = Math.max(46, Math.min(startRect.width, startRect.height) * 0.8);
  const startX = startRect.left + (startRect.width - size) / 2;
  const startY = startRect.top + (startRect.height - size) / 2;

  const clone = document.createElement('div');
  clone.className = 'fly-clone';
  clone.style.cssText = `left:${startX}px; top:${startY}px; width:${size}px; height:${size}px;`;
  const cloneImg = imgEl.cloneNode(true);
  cloneImg.removeAttribute('loading');
  cloneImg.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
  clone.appendChild(cloneImg);
  document.body.appendChild(clone);

  const startCenterX = startX + size / 2;
  const startCenterY = startY + size / 2;
  const endCenterX = endRect.left + endRect.width / 2;
  const endCenterY = endRect.top + endRect.height / 2;
  const dx = endCenterX - startCenterX;
  const dy = endCenterY - startCenterY;
  const arcLift = Math.min(100, Math.abs(dy) * 0.5 + 40); // gentle rise that flattens out as it nears the cart

  const anim = clone.animate([
    { transform: 'translate(0,0) scale(1)',                                        opacity: 1, offset: 0    },
    { transform: `translate(${dx*0.18}px, ${dy*0.18 - arcLift}px) scale(.78)`,      opacity: 1, offset: .25 },
    { transform: `translate(${dx*0.42}px, ${dy*0.42 - arcLift*0.6}px) scale(.52)`,  opacity: 1, offset: .5  },
    { transform: `translate(${dx*0.70}px, ${dy*0.70 - arcLift*0.2}px) scale(.26)`,  opacity: 1, offset: .75 },
    { transform: `translate(${dx*0.94}px, ${dy*0.94}px) scale(.08)`,                opacity: 1, offset: .95 },
    { transform: `translate(${dx}px, ${dy}px) scale(.02)`,                          opacity: 0, offset: 1    }
  ], { duration: 1050, easing: 'cubic-bezier(.76,.05,.86,.06)' }); // slow drift, then pulled in fast at the very end

  anim.onfinish = () => {
    clone.remove();
    cartIcon.classList.remove('cart-hit');
    void cartIcon.offsetWidth; // restart the gulp bounce even if it's already mid-play
    cartIcon.classList.add('cart-hit');
    if (onLand) onLand();
  };
}

// Shared "fly into the cart, then react" sequencing used by every Add/Buy
// Now button across the site — keeps the cart badge bump and (optionally)
// opening the drawer in sync with the moment the product actually "lands".
function playAddFlourish(imgEl, { openCartAfter = false } = {}){
  const finish = () => {
    updateCartBadge();
    if (openCartAfter) openCart();
  };
  flyToCart(imgEl, finish);
}

/* ---------------- Track your order ---------------- */
function openTrackOrder(){
  const overlay = $('#trackOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  $('#trackForm').style.display = 'block';
  $('#trackResult').style.display = 'none';
  $('#trackError').style.display = 'none';
  $('#trackOrderId').focus();
}
function closeTrackOrder(){
  const overlay = $('#trackOverlay');
  if (overlay) overlay.classList.remove('open');
}

function showTrackError(msg){
  const el = $('#trackError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

async function submitTrackOrder(){
  const orderId = ($('#trackOrderId').value || '').trim();
  const phone = ($('#trackPhone').value || '').trim();
  $('#trackError').style.display = 'none';

  if (!orderId || !phone){
    showTrackError('Please enter both your Order ID and phone number.');
    return;
  }
  if (!CONFIG.SHEET_API_URL){
    showTrackError("Order tracking isn't set up yet — message us on WhatsApp for your order status.");
    return;
  }

  const btn = $('#trackSubmitBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try{
    const url = `${CONFIG.SHEET_API_URL}?action=trackOrder&orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!data || !data.success){
      showTrackError("We couldn't find a matching order. Double-check the Order ID and phone number, or message us on WhatsApp.");
      return;
    }
    renderTrackResult(data);
  } catch(err){
    showTrackError('Something went wrong — please try again or message us on WhatsApp.');
  } finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function renderTrackResult(o){
  $('#trackForm').style.display = 'none';
  const wrap = $('#trackResult');
  wrap.style.display = 'block';

  const status = String(o.status || 'Pending').trim();
  const statusLower = status.toLowerCase();
  const isCancelled = statusLower === 'cancelled';
  const isFulfilled = statusLower === 'fulfilled';

  const stepsHtml = isCancelled ? `
    <div class="track-steps cancelled">
      <div class="track-step done"><span class="dot"></span>Order received</div>
      <div class="track-step cancel"><span class="dot"></span>Cancelled</div>
    </div>` : `
    <div class="track-steps">
      <div class="track-step done"><span class="dot"></span>Order received</div>
      <div class="track-step ${isFulfilled ? 'done' : 'active'}"><span class="dot"></span>Packed &amp; fulfilled</div>
    </div>`;

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
  $('#trackAnotherBtn').addEventListener('click', openTrackOrder);
}

document.addEventListener('DOMContentLoaded', () => {
  const trigger = $('#trackOrderTrigger');
  const heroTrigger = $('#heroTrackBtn');
  const closeBtn = $('#trackOverlayClose');
  const submitBtn = $('#trackSubmitBtn');
  const overlay = $('#trackOverlay');
  if (trigger) trigger.addEventListener('click', openTrackOrder);
  if (heroTrigger) heroTrigger.addEventListener('click', openTrackOrder);
  if (closeBtn) closeBtn.addEventListener('click', closeTrackOrder);
  if (submitBtn) submitBtn.addEventListener('click', submitTrackOrder);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target.id === 'trackOverlay') closeTrackOrder(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrackOrder(); });
});

let cartScrollLockY = 0;

function lockPageForCart(){
  // position:fixed is more reliable than overflow:hidden on Android browsers.
  if (document.body.classList.contains('modal-open')) return;
  cartScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${cartScrollLockY}px`;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

function unlockPageFromCart(){
  if (!document.body.classList.contains('modal-open')) return;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, cartScrollLockY);
}

function openCart(){
  // Reconcile against the live catalog if one is loaded on this page (it
  // won't be on About/Contact, which never fetch products — safe no-op there).
  if (typeof ALL_PRODUCTS !== 'undefined' && ALL_PRODUCTS.length){
    const { removed } = CartStore.syncWithCatalog(ALL_PRODUCTS);
    if (removed.length) showToast(`${removed.join(', ')} ${removed.length > 1 ? 'are' : 'is'} no longer available and ${removed.length > 1 ? 'were' : 'was'} removed from your cart`);
  }
  renderCartDrawer();
  lockPageForCart();
  $('#cartOverlay').classList.add('open');
  fetchPromosIfNeeded();
  fetchCheckoutConfigIfNeeded().then(() => {
    if ($('#cartOverlay') && $('#cartOverlay').classList.contains('open')) renderCartDrawer();
  });
}
function closeCart(){
  $('#cartOverlay').classList.remove('open');
  unlockPageFromCart();
}

/* ---------------- Promo codes ---------------- */
async function fetchPromosIfNeeded(){
  if (checkoutState.availablePromos !== null) return; // already fetched this page load
  if (!CONFIG.SHEET_API_URL) { checkoutState.availablePromos = []; return; }
  try{
    const res = await fetch(`${CONFIG.SHEET_API_URL}?action=promos`, { cache: 'no-store' });
    const data = await res.json();
    checkoutState.availablePromos = Array.isArray(data) ? data : [];
  } catch(err){
    checkoutState.availablePromos = [];
  }
}

async function applyPromoCode(){
  if (checkoutState.availablePromos === null){
    await fetchPromosIfNeeded();
  }
  const typed = checkoutState.promoInput.trim();
  if (!typed){
    checkoutState.promoStatus = 'Enter a code first.';
    checkoutState.appliedPromo = null;
    renderCartDrawer();
    return;
  }
  const list = checkoutState.availablePromos || [];
  const match = list.find(p => p.code.toLowerCase() === typed.toLowerCase());
  if (!match){
    checkoutState.appliedPromo = null;
    checkoutState.promoStatus = 'That code isn\'t valid.';
  } else {
    checkoutState.appliedPromo = match;
    checkoutState.promoStatus = match.type === 'percent'
      ? `Applied — ${match.value}% off`
      : `Applied — ₹${match.value} off`;
  }
  renderCartDrawer();
}

function computeDiscount(subtotal){
  const promo = checkoutState.appliedPromo;
  if (!promo) return 0;
  const raw = promo.type === 'percent' ? subtotal * (promo.value / 100) : promo.value;
  return Math.min(Math.max(raw, 0), subtotal);
}

async function fetchCheckoutConfigIfNeeded(){
  if (checkoutState.feeConfig !== null) return checkoutState.feeConfig;
  const fallback = { deliveryFreeAbove: 0, deliveryCharge: 0, codCharge: 0 };
  if (!CONFIG.SHEET_API_URL){ checkoutState.feeConfig = fallback; return fallback; }
  try{
    const res = await fetch(`${CONFIG.SHEET_API_URL}?action=checkoutConfig`, { cache: 'no-store' });
    const data = await res.json();
    checkoutState.feeConfig = {
      deliveryFreeAbove: Math.max(0, Number(data.deliveryFreeAbove) || 0),
      deliveryCharge: Math.max(0, Number(data.deliveryCharge) || 0),
      codCharge: Math.max(0, Number(data.codCharge) || 0)
    };
  } catch(err){ checkoutState.feeConfig = fallback; }
  return checkoutState.feeConfig;
}

function computeCheckoutTotals(subtotal){
  const discount = computeDiscount(subtotal);
  const merchandiseTotal = Math.max(0, subtotal - discount);
  const cfg = checkoutState.feeConfig || { deliveryFreeAbove: 0, deliveryCharge: 0, codCharge: 0 };
  const deliveryCharge = cfg.deliveryCharge > 0 && cfg.deliveryFreeAbove > 0 && merchandiseTotal < cfg.deliveryFreeAbove ? cfg.deliveryCharge : 0;
  const codCharge = checkoutState.paymentMethod === 'COD' ? cfg.codCharge : 0;
  return { discount, merchandiseTotal, deliveryCharge, codCharge, grandTotal: merchandiseTotal + deliveryCharge + codCharge };
}

/* ---------------- UPI ---------------- */
function buildUpiLink(amount){
  const params = new URLSearchParams({
    pa: CONFIG.UPI_ID,
    pn: CONFIG.UPI_PAYEE_NAME || CONFIG.SHOP_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Order at ${CONFIG.SHOP_NAME}`
  });
  return `upi://pay?${params.toString()}`;
}

/* ---------------- Cart drawer ---------------- */
function renderCartDrawer(){
  const wrap = $('#cartContent');
  const previousScroll = $('#cartMain') ? $('#cartMain').scrollTop : 0;
  const cart = CartStore.getAll();
  const items = Object.values(cart);

  if (!items.length){
    wrap.innerHTML = `
      <div class="cart-header">
        <div><span class="cart-eyebrow">SHOPPING BAG</span><h2>Your cart</h2></div>
        <button class="closebtn" id="cartClose" aria-label="Close cart">✕</button>
      </div>
      <div class="cart-main" id="cartMain">
        <div class="cart-empty"><div class="cart-empty-icon">🛍️</div><strong>Your cart is empty</strong><br><span>Add a few things from the shop and they will appear here.</span></div>
      </div>`;
    $('#cartClose').addEventListener('click', closeCart);
    return;
  }

  const subtotal = CartStore.total();
  const { discount, merchandiseTotal, deliveryCharge, codCharge, grandTotal } = computeCheckoutTotals(subtotal);
  const showUpi = !!CONFIG.UPI_ID;

  wrap.innerHTML = `
    <div class="cart-header">
      <div><span class="cart-eyebrow">SHOPPING BAG · ${CartStore.count()} ITEM${CartStore.count() === 1 ? '' : 'S'}</span><h2>Your cart</h2></div>
      <button class="closebtn" id="cartClose" aria-label="Close cart">✕</button>
    </div>
    <div class="cart-main" id="cartMain">
      <section class="cart-items-section">
        <div class="cart-section-head"><span>Items in your cart</span><span>${CartStore.count()} item${CartStore.count() === 1 ? '' : 's'}</span></div>
        <div id="cartItems">
          ${items.map(({product, qty}) => `
            <div class="cart-item" data-id="${escapeHtml(product.id)}">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
              <div class="ci-info">
                <div class="ci-name">${escapeHtml(product.name)}</div>
                <div class="ci-id">${money(product.price)} each</div>
                <div class="ci-price">${money(product.price*qty)}</div>
              </div>
              <div class="cart-item-actions">
                <div class="stepper" data-id="${escapeHtml(product.id)}">
                  <button type="button" data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-act="inc" aria-label="Increase quantity" ${product.stockQty !== null && qty >= product.stockQty ? 'disabled' : ''}>+</button>
                </div>
                <button type="button" class="cart-remove" data-act="remove" data-id="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(product.name)}">Remove</button>
              </div>
            </div>`).join('')}
        </div>
      </section>

      <div class="cart-summary">
        <div class="cart-checkout-title"><div><span class="cart-eyebrow">CHECKOUT</span><h3>Delivery details</h3></div></div>
        <div class="field">
          <label for="custName">Your name</label>
          <input type="text" id="custName" placeholder="Full name" autocomplete="name" value="${escapeHtml(checkoutState.name)}">
        </div>
        <div class="field">
          <label for="custPhone">Phone number</label>
          <input type="tel" id="custPhone" placeholder="10-digit mobile number" autocomplete="tel" inputmode="numeric" value="${escapeHtml(checkoutState.phone)}">
        </div>
        <div class="field">
          <label for="custAddress">Delivery address</label>
          <textarea id="custAddress" placeholder="House no, street, village/city, PIN code">${escapeHtml(checkoutState.address)}</textarea>
        </div>
        <div class="field">
          <label for="promoInput">Promo code <span class="optional">(optional)</span></label>
          <div class="promo-row">
            <input type="text" id="promoInput" placeholder="Enter code" value="${escapeHtml(checkoutState.promoInput)}">
            <button type="button" class="ghost-btn" id="applyPromoBtn">Apply</button>
          </div>
          ${checkoutState.promoStatus ? `<div class="statusline ${checkoutState.appliedPromo ? 'ok' : 'err'}">${escapeHtml(checkoutState.promoStatus)}</div>` : ''}
        </div>
        <div class="field">
          <label>Payment method</label>
          <div class="pay-options">
            <label class="pay-option"><input type="radio" name="payMethod" value="COD" ${checkoutState.paymentMethod === 'COD' ? 'checked' : ''}> <span>Cash on Delivery</span></label>
            ${showUpi ? `<label class="pay-option"><input type="radio" name="payMethod" value="UPI" ${checkoutState.paymentMethod === 'UPI' ? 'checked' : ''}> <span>Pay via UPI</span></label>` : ''}
          </div>
          ${(showUpi && checkoutState.paymentMethod === 'UPI') ? `<div class="upi-box"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(buildUpiLink(grandTotal))}" alt="UPI QR code" width="140" height="140"><a class="ghost-btn" href="${buildUpiLink(grandTotal)}">Open UPI app</a><p class="hint">Scan or tap, then send your order below.</p></div>` : ''}
        </div>
        <div class="cart-total-box">
          <div class="row"><span>Items</span><span>${CartStore.count()}</span></div>
          <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          ${discount > 0 ? `<div class="row"><span>Discount</span><span>−${money(discount)}</span></div>` : ''}
          ${deliveryCharge > 0 ? `<div class="row"><span>Delivery</span><span>${money(deliveryCharge)}</span></div>` : ''}
          ${codCharge > 0 ? `<div class="row"><span>Cash on Delivery fee</span><span>${money(codCharge)}</span></div>` : ''}
          ${(checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 && deliveryCharge === 0) ? `<div class="row fee-free"><span>Delivery</span><span>FREE</span></div>` : ''}
          <div class="row total"><span>Total</span><span>${money(grandTotal)}</span></div>
        </div>
        ${checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 ? `<p class="checkout-fee-note">Free delivery on orders of ${money(checkoutState.feeConfig.deliveryFreeAbove)} or more.</p>` : ''}
        <button class="primary-btn" id="orderWaBtn" type="button">Place order</button>
        <button class="ghost-btn cart-clear" id="clearCartBtn" type="button">Clear cart</button>
      </div>
    </div>`;

  $('#cartClose').addEventListener('click', closeCart);
  $$('.stepper', wrap).forEach(stepper => {
    const id = stepper.dataset.id;
    const entry = cart[id];
    if (!entry) return;
    $('[data-act="inc"]', stepper).addEventListener('click', () => {
      if (entry.product.stockQty !== null && CartStore.qtyFor(id) >= entry.product.stockQty){ showToast(`Only ${entry.product.stockQty} in stock`); return; }
      CartStore.add(entry.product, 1); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
    });
    $('[data-act="dec"]', stepper).addEventListener('click', () => { CartStore.add(entry.product, -1); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard(); });
  });
  $$('.cart-remove', wrap).forEach(btn => btn.addEventListener('click', () => {
    const entry = cart[btn.dataset.id]; if (!entry) return;
    CartStore.add(entry.product, -entry.qty); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
  }));

  $('#custName').addEventListener('input', e => { checkoutState.name = e.target.value; saveCheckoutInfo(); });
  $('#custPhone').addEventListener('input', e => { checkoutState.phone = e.target.value; saveCheckoutInfo(); });
  $('#custAddress').addEventListener('input', e => { checkoutState.address = e.target.value; saveCheckoutInfo(); });
  $('#promoInput').addEventListener('input', e => { checkoutState.promoInput = e.target.value; });
  $('#applyPromoBtn').addEventListener('click', applyPromoCode);
  $$('input[name="payMethod"]', wrap).forEach(radio => radio.addEventListener('change', e => { checkoutState.paymentMethod = e.target.value; saveCheckoutInfo(); renderCartDrawer(); }));
  $('#orderWaBtn').addEventListener('click', submitOrder);
  $('#clearCartBtn').addEventListener('click', () => { if (confirm('Clear all items from your cart?')) { CartStore.clear(); updateCartBadge(); renderCartDrawer(); } });
  requestAnimationFrame(() => { const main = $('#cartMain'); if (main) main.scrollTop = Math.min(previousScroll, main.scrollHeight); });
}

function renderOrderConfirmation(receipt){
  const wrap = $('#cartContent');
  const orderId = receipt && receipt.orderId ? receipt.orderId : '';
  wrap.innerHTML = `
    <button class="closebtn" id="cartClose" aria-label="Close">✕</button>
    <div class="order-confirm">
      <div class="confirm-icon">✓</div>
      <h2>Your order is confirmed</h2>
      ${orderId ? `<p class="confirm-id">Order ID: <strong>${escapeHtml(orderId)}</strong></p>` : ''}
      <p class="confirm-message">Your order has been received successfully. You will get a confirmation message on WhatsApp shortly.</p>
      <div class="confirm-actions">
        <button class="primary-btn" id="downloadReceiptBtn" type="button">⬇ Download order slip</button>
        <button class="ghost-btn" id="confirmCloseBtn" type="button">Continue shopping</button>
      </div>
    </div>`;
  const close = () => closeCart();
  $('#cartClose').addEventListener('click', close);
  $('#confirmCloseBtn').addEventListener('click', close);
  $('#downloadReceiptBtn').addEventListener('click', () => downloadReceipt(receipt));
}

function downloadReceipt(receipt){
  if (!receipt) return;
  const isUpi = receipt.paymentMethod === 'UPI';
  const paymentNote = isUpi
    ? `<div class="notice"><strong>Important:</strong> This is an order confirmation slip only. It is <strong>not a payment receipt</strong> and does not confirm that a UPI payment was received.</div>`
    : `<div class="notice"><strong>Payment:</strong> Cash on Delivery selected. Payment is due at delivery.</div>`;
  const itemRows = (receipt.items || []).map(item => `
    <tr><td>${escapeHtml(item.name)}</td><td>${Number(item.qty)||0}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>`).join('');
  const feeRows = `${receipt.discount > 0 ? `<tr><td colspan="3">Discount${receipt.promoCode ? ` (${escapeHtml(receipt.promoCode)})` : ''}</td><td>−${money(receipt.discount)}</td></tr>` : ''}
    ${receipt.deliveryCharge > 0 ? `<tr><td colspan="3">Delivery</td><td>${money(receipt.deliveryCharge)}</td></tr>` : ''}
    ${receipt.codCharge > 0 ? `<tr><td colspan="3">Cash on Delivery fee</td><td>${money(receipt.codCharge)}</td></tr>` : ''}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Confirmation ${escapeHtml(receipt.orderId)}</title><style>body{font-family:Arial,sans-serif;color:#222;max-width:760px;margin:40px auto;padding:0 20px}h1{margin:0 0 6px}p{line-height:1.5}.muted{color:#666}.notice{margin:16px 0;padding:12px 14px;border:1px solid #ddd;border-radius:10px;background:#fff8e8;line-height:1.5}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:10px 8px;border-bottom:1px solid #ddd;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.total td{font-size:18px;font-weight:700;border-top:2px solid #222}.box{background:#f7f7f7;padding:14px;border-radius:10px;margin:16px 0}@media print{body{margin:0}.no-print{display:none}}</style></head><body><h1>${escapeHtml(CONFIG.SHOP_NAME)}</h1><p class="muted"><strong>Order Confirmation Slip</strong></p><div class="box"><strong>Order ID:</strong> ${escapeHtml(receipt.orderId)}<br><strong>Date:</strong> ${escapeHtml(formatDateTime(receipt.orderDate || new Date()))}<br><strong>Customer:</strong> ${escapeHtml(receipt.name)}<br><strong>Phone:</strong> ${escapeHtml(receipt.phone)}<br><strong>Address:</strong> ${escapeHtml(receipt.address)}<br><strong>Payment method:</strong> ${escapeHtml(receipt.paymentMethod)}</div>${paymentNote}<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>${itemRows}<tr><td colspan="3">Subtotal</td><td>${money(receipt.subtotal)}</td></tr>${feeRows}<tr class="total"><td colspan="3">Order total</td><td>${money(receipt.total)}</td></tr></tbody></table><p>Thank you for shopping with ${escapeHtml(CONFIG.SHOP_NAME)}.</p><p class="muted">This document confirms the order details recorded by the store website.</p></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `order-confirmation-${String(receipt.orderId || 'order').replace(/[^a-z0-9_-]/gi,'-')}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function submitOrder(){
  const items = Object.values(CartStore.getAll());
  if (!items.length) return;

  const name = checkoutState.name.trim();
  const phone = checkoutState.phone.trim();
  const address = checkoutState.address.trim();
  if (!name || !phone || !address){
    showToast('Please fill in your name, phone, and delivery address');
    return;
  }

  const btn = $('#orderWaBtn');
  if (btn){ btn.disabled = true; btn.textContent = 'Checking stock…'; }

  const localSubtotal = CartStore.total();
  const paymentMethod = checkoutState.paymentMethod === 'UPI' ? 'UPI' : 'Cash on Delivery';
  const promoCode = checkoutState.appliedPromo ? checkoutState.appliedPromo.code : '';
  const itemsDetail = items.map(({product, qty}) => ({ id: product.id, qty }));
  let data = null;

  if (CONFIG.SHEET_API_URL){
    try{
      const res = await fetch(CONFIG.SHEET_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'addOrder',
          order: {
            customerName: name,
            phone,
            address,
            paymentMethod,
            promoCode,
            // These are display hints only. The server ignores them for money
            // calculations and rebuilds price/stock from the Products sheet.
            subtotal: localSubtotal,
            itemsDetail
          }
        })
      });
      data = await res.json();
      if (!data || data.success !== true || !data.orderId){
        throw new Error((data && data.error) || 'The order could not be accepted.');
      }
    } catch(err){
      console.error('Could not save order to sheet', err);
      if (btn){ btn.disabled = false; btn.textContent = 'Place order'; }
      const msg = String(err && err.message || err);
      showToast(msg.length > 90 ? 'Could not place order. Please try again.' : msg);
      // Refresh the catalog after a server-side stock rejection so the cart
      // immediately reflects the authoritative quantity.
      if (typeof loadAllProducts === 'function'){
        try{
          await loadAllProducts();
          if (typeof CartStore.syncWithCatalog === 'function') CartStore.syncWithCatalog(ALL_PRODUCTS || []);
          renderCartDrawer();
        } catch (_) {}
      }
      return;
    }
  } else {
    // Local/demo mode is only for local UI testing. Production configuration should always
    // have SHEET_API_URL set, so real orders cannot bypass server validation.
    data = {
      success: true,
      orderId: '',
      subtotal: localSubtotal,
      discount: computeCheckoutTotals(localSubtotal).discount,
      deliveryCharge: computeCheckoutTotals(localSubtotal).deliveryCharge,
      codCharge: computeCheckoutTotals(localSubtotal).codCharge,
      correctedTotal: computeCheckoutTotals(localSubtotal).grandTotal,
      items: items.map(({product, qty}) => ({ id: product.id, name: product.name, qty, unitPrice: Number(product.price) || 0, lineTotal: (Number(product.price) || 0) * qty }))
    };
  }

  const verifiedItems = Array.isArray(data.items) ? data.items : [];
  const finalDiscount = Number(data.discount) || 0;
  const finalDeliveryCharge = Number(data.deliveryCharge) || 0;
  const finalCodCharge = Number(data.codCharge) || 0;
  const finalTotal = Number(data.correctedTotal) || 0;

  if (data.promoRejected) showToast('That promo code no longer applies — order placed at full price');

  lastReceipt = {
    orderId: data.orderId || '',
    orderDate: data.orderDate || new Date().toISOString(),
    name, phone, address, paymentMethod, promoCode,
    subtotal: Number(data.subtotal) || localSubtotal,
    discount: finalDiscount,
    deliveryCharge: finalDeliveryCharge,
    codCharge: finalCodCharge,
    total: finalTotal,
    items: verifiedItems
  };

  CartStore.clear();
  updateCartBadge();
  checkoutState.promoInput = '';
  checkoutState.appliedPromo = null;
  checkoutState.promoStatus = '';
  renderOrderConfirmation(lastReceipt);
  if (typeof renderGrid === 'function') renderGrid();
  if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
}
