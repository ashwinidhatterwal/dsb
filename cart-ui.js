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

  // Sample a continuous curve; only transform and opacity animate.
  const frames=Array.from({length:21},(_,i)=>{
    const t=i/20;
    return {transform:`translate(${dx*t}px, ${dy*t-Math.sin(Math.PI*t)*arcLift*.55}px) scale(${1-.96*t})`,opacity:t>.8 ? (1-t)/.2 : 1,offset:t};
  });
  const anim = clone.animate(frames,{duration:520,easing:'cubic-bezier(.2,.65,.35,1)'});

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
  openDialogFocus(overlay,closeTrackOrder);
  $('#trackOrderId').focus();
}
function closeTrackOrder(){
  const overlay = $('#trackOverlay');
  if (overlay) { overlay.classList.remove('open'); closeDialogFocus(overlay); }
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

async function openCart(){
  // Reconcile against the live catalog if one is loaded on this page (it
  // won't be on About/Contact, which never fetch products — safe no-op there).
  if (typeof ALL_PRODUCTS !== 'undefined' && ALL_PRODUCTS.length){
    const { removed } = await CartStore.syncSafe(ALL_PRODUCTS);
    if (removed.length) showToast(`${removed.join(', ')} ${removed.length > 1 ? 'are' : 'is'} no longer available and ${removed.length > 1 ? 'were' : 'was'} removed from your cart`);
  }
  renderCartDrawer();
  if(CartStore.takeRepairNotice()) showToast('Some saved cart data was damaged and has been removed.');
  lockPageForCart();
  $('#cartOverlay').classList.add('open');
  openDialogFocus($('#cartContent'),closeCart);
  fetchPromosIfNeeded();
  fetchCheckoutConfigIfNeeded().then(() => {
    if ($('#cartOverlay')?.classList.contains('open') && !checkoutBusy && !checkoutQuote && !pendingCheckout && !$('#downloadReceiptBtn')) renderCartDrawer();
  });
}
function closeCart(){
  $('#cartOverlay').classList.remove('open');
  closeDialogFocus($('#cartContent'));
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
  if (!CONFIG.SHEET_API_URL) return null;
  try {
    const data = await requestJson(`${CONFIG.SHEET_API_URL}?action=checkoutConfig`);
    if (data.checkoutVersion !== 2) throw new Error('Checkout update required.');
    if (!['deliveryFreeAbove','deliveryCharge','codCharge'].every(k=>Number.isFinite(Number(data[k])) && Number(data[k])>=0)) throw new Error('Invalid checkout settings.');
    checkoutState.feeConfig = data;
  } catch(err) { /* Keep fees unknown, never silently treat a failed request as free delivery. */ }
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
function buildUpiLink(amount, orderId){
  const params = new URLSearchParams({
    pa: CONFIG.UPI_ID,
    pn: CONFIG.UPI_PAYEE_NAME || CONFIG.SHOP_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: orderId ? `Order ${orderId}` : `Order at ${CONFIG.SHOP_NAME}`,
    ...(orderId ? {tr:orderId} : {})
  });
  return `upi://pay?${params.toString()}`;
}

/* ---------------- Cart drawer ---------------- */
function renderCartDrawer(){
  const wrap = $('#cartContent');
  if (pendingCheckout) { renderPendingCheckout(); return; }
  if (checkoutQuote) { renderCheckoutReview(); return; }
  const focusId = wrap.contains(document.activeElement) ? document.activeElement.id : '';
  const previousScroll = $('#cartMain') ? $('#cartMain').scrollTop : 0;
  const cart = CartStore.getAll();
  const items = Object.values(cart);
  try { if(!lastReceipt) lastReceipt=JSON.parse(localStorage.getItem('dsb_last_receipt_v2') || 'null'); } catch(_){}

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
    if(lastReceipt){const b=document.createElement('button');b.type='button';b.className='ghost-btn';b.textContent='View last order';b.onclick=()=>renderOrderConfirmation(lastReceipt);wrap.appendChild(b);}
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
                <div class="ci-id">${product.size ? `<span>Size: ${escapeHtml(product.size)}</span> · ` : ''}${money(product.price)} each</div>
                <div class="ci-price">${money(product.price*qty)}</div>
              </div>
              <div class="cart-item-actions">
                <div class="stepper" data-id="${escapeHtml(product.id)}">
                  <button type="button" data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-act="inc" aria-label="Increase quantity" ${product.stockQty !== null && CartStore.qtyForProduct(product.productId || product.id) >= product.stockQty ? 'disabled' : ''}>+</button>
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
          ${(showUpi && checkoutState.paymentMethod === 'UPI') ? '<p class="hint">UPI payment opens after your order is saved with the confirmed total.</p>' : ''}
        </div>
        <div class="cart-total-box">
          <div class="row"><span>Items</span><span>${CartStore.count()}</span></div>
          <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          ${discount > 0 ? `<div class="row"><span>Discount</span><span>−${money(discount)}</span></div>` : ''}
          ${deliveryCharge > 0 ? `<div class="row"><span>Delivery</span><span>${money(deliveryCharge)}</span></div>` : ''}
          ${codCharge > 0 ? `<div class="row"><span>Cash on Delivery fee</span><span>${money(codCharge)}</span></div>` : ''}
          ${(checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 && deliveryCharge === 0) ? `<div class="row fee-free"><span>Delivery</span><span>FREE</span></div>` : ''}
          <div class="row total"><span>${checkoutState.feeConfig ? 'Estimated total' : 'Subtotal — fees checked next'}</span><span>${money(grandTotal)}</span></div>
        </div>
        ${checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 ? `<p class="checkout-fee-note">Free delivery on orders of ${money(checkoutState.feeConfig.deliveryFreeAbove)} or more.</p>` : ''}
        <p class="hint">Review the final total before confirming your order.</p><div class="checkout-honeypot" aria-hidden="true"><label>Website<input id="orderWebsite" tabindex="-1" autocomplete="off"></label></div><button class="primary-btn" id="orderWaBtn" type="button">Review order</button>
        <button class="ghost-btn cart-clear" id="clearCartBtn" type="button">Clear cart</button>
      </div>
    </div>`;

  $('#cartClose').addEventListener('click', closeCart);
  $$('.stepper', wrap).forEach(stepper => {
    const id = stepper.dataset.id;
    const entry = cart[id];
    if (!entry) return;
    $('[data-act="inc"]', stepper).addEventListener('click', async () => {
      if (entry.product.stockQty !== null && CartStore.qtyForProduct(entry.product.productId || entry.product.id) >= entry.product.stockQty){ showToast(`Only ${entry.product.stockQty} in stock`); return; }
      await CartStore.addSafe(entry.product, 1); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
    });
    $('[data-act="dec"]', stepper).addEventListener('click', async () => { await CartStore.addSafe(entry.product, -1); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard(); });
  });
  $$('.cart-remove', wrap).forEach(btn => btn.addEventListener('click', async () => {
    const entry = cart[btn.dataset.id]; if (!entry) return;
    await CartStore.addSafe(entry.product, -entry.qty); updateCartBadge(); renderCartDrawer(); if (typeof renderGrid === 'function') renderGrid(); if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
  }));

  $('#custName').addEventListener('input', e => { checkoutState.name = e.target.value; saveCheckoutInfo(); });
  $('#custPhone').addEventListener('input', e => { checkoutState.phone = e.target.value; saveCheckoutInfo(); });
  $('#custAddress').addEventListener('input', e => { checkoutState.address = e.target.value; saveCheckoutInfo(); });
  $('#promoInput').addEventListener('input', e => { checkoutState.promoInput = e.target.value; });
  $('#applyPromoBtn').addEventListener('click', applyPromoCode);
  $$('input[name="payMethod"]', wrap).forEach(radio => radio.addEventListener('change', e => { checkoutState.paymentMethod = e.target.value; saveCheckoutInfo(); renderCartDrawer(); }));
  $('#orderWaBtn').addEventListener('click', submitOrder);
  $('#clearCartBtn').addEventListener('click', async () => { if (confirm('Clear all items from your cart?')) { await CartStore.clearSafe(); updateCartBadge(); renderCartDrawer(); } });
  requestAnimationFrame(() => { const main = $('#cartMain'); if (main) main.scrollTop = Math.min(previousScroll, main.scrollHeight); if (focusId) document.getElementById(focusId)?.focus({preventScroll:true}); });
}

function renderOrderConfirmation(receipt){
  const wrap = $('#cartContent');
  const orderId = receipt && receipt.orderId ? receipt.orderId : '';
  wrap.innerHTML = `
    <button class="closebtn" id="cartClose" aria-label="Close">✕</button>
    <div class="order-confirm" data-i18n-skip>
      <div class="confirm-icon">✓</div>
      <h2>Your order is confirmed</h2>
      ${orderId ? `<p class="confirm-id">Order ID: <strong>${escapeHtml(orderId)}</strong></p>` : ''}
      <p class="confirm-message">Your order has been received successfully. You will get a confirmation message on WhatsApp shortly.</p>
      <p><strong>Order total: ${money(receipt.total)}</strong></p>
      ${receipt.paymentMethod === 'UPI' && CONFIG.UPI_ID ? `<div class="upi-box"><p>Payment is not yet verified. Pay ${money(receipt.total)} using the link below. If you have already paid for this order, do not pay again.</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&amp;data=${encodeURIComponent(buildUpiLink(receipt.total,orderId))}" alt="UPI payment QR code" width="140" height="140"><a class="primary-btn" href="${escapeHtml(buildUpiLink(receipt.total,orderId))}">Open UPI app</a><p>UPI ID: ${escapeHtml(CONFIG.UPI_ID)} · Reference: ${escapeHtml(orderId)}</p></div>` : ''}
      <div class="confirm-actions">
        <button class="primary-btn" id="downloadReceiptBtn" type="button">⬇ Download order slip</button>
        <button class="ghost-btn" id="confirmCloseBtn" type="button">Continue shopping</button>
      </div>
    </div>`;
  const close = () => closeCart();
  $('#cartClose').addEventListener('click', close);
  $('#confirmCloseBtn').addEventListener('click', close);
  $('#downloadReceiptBtn').addEventListener('click', async () => downloadReceipt(receipt));
  $('#downloadReceiptBtn').focus();
}

function downloadReceipt(receipt){
  if (!receipt) return;
  const isUpi = receipt.paymentMethod === 'UPI';
  const paymentNote = isUpi
    ? `<div class="notice"><strong>Important:</strong> This is an order confirmation slip only. It is <strong>not a payment receipt</strong> and does not confirm that a UPI payment was received.</div>`
    : `<div class="notice"><strong>Payment:</strong> Cash on Delivery selected. Payment is due at delivery.</div>`;
  const itemRows = (receipt.items || []).map(item => `
    <tr><td>${escapeHtml(item.name)}${item.size ? ` (Size: ${escapeHtml(item.size)})` : ''}</td><td>${Number(item.qty)||0}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>`).join('');
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

const PENDING_CHECKOUT_KEY = 'dsb_pending_checkout_v2';
let checkoutBusy = false, checkoutQuote = null, pendingCheckout = null;
try { pendingCheckout = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null'); } catch (_) {}
if (pendingCheckout && (!pendingCheckout.order || !pendingCheckout.requestId)) pendingCheckout = null;
async function postCheckout(action,body){
  if (!CONFIG.SHEET_API_URL) throw new Error('Checkout is unavailable in demo mode.');
  return requestJson(CONFIG.SHEET_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...body})},30000);
}
function checkoutOrderFromForm(){
  return {customerName:checkoutState.name.trim(),phone:checkoutState.phone.trim(),address:checkoutState.address.trim(),paymentMethod:checkoutState.paymentMethod==='UPI'?'UPI':'Cash on Delivery',promoCode:checkoutState.appliedPromo?.code || '',itemsDetail:Object.values(CartStore.getAll()).map(({product,qty})=>({id:product.productId || product.id,qty,...(product.size ? {size:product.size} : {})})),website:$('#orderWebsite')?.value || ''};
}
async function submitOrder(){
  if (checkoutBusy) return;
  const order = checkoutOrderFromForm();
  if (!order.itemsDetail.length) return;
  if (order.customerName.length<2 || !/^\+?[\d\s()-]{10,20}$/.test(order.phone) || order.address.length<5){showToast('Please fill in a valid name, phone number and delivery address.');return;}
  if(checkoutState.feeConfig){
    const subtotal=CartStore.total(), totals=computeCheckoutTotals(subtotal);
    const items=Object.values(CartStore.getAll()).map(({product,qty})=>({id:product.productId || product.id,name:product.name,qty,...(product.size?{size:product.size}:{}),unitPrice:Number(product.price),lineTotal:Math.round(Number(product.price)*qty*100)/100}));
    checkoutQuote={order,quote:{subtotal,discount:totals.discount,deliveryCharge:totals.deliveryCharge,codCharge:totals.codCharge,correctedTotal:totals.grandTotal,items}};
    renderCheckoutReview();return;
  }
  checkoutBusy=true;
  const btn=$('#orderWaBtn'); if(btn){btn.disabled=true;btn.textContent='Checking stock…';}
  try {
    const data=await postCheckout('quoteOrder',{order});
    if(data.success!==true || !data.quoteToken) throw new Error(data.error || 'Checkout needs an update. Please contact the shop.');
    checkoutQuote={order,quote:data}; renderCheckoutReview();
  } catch(err){showCheckoutError(err.message);}
  finally{checkoutBusy=false;if(btn?.isConnected){btn.disabled=false;btn.textContent='Review order';}}
}
function showCheckoutError(message){
  let el=$('#checkoutError');
  if(!el){el=document.createElement('p');el.id='checkoutError';el.className='statusline err';el.setAttribute('role','alert');$('#cartContent').appendChild(el);}
  el.textContent=message;el.scrollIntoView({block:'nearest'});
}
function renderCheckoutReview(message=''){
  if(!checkoutQuote) return;
  const {order,quote:q}=checkoutQuote;
  $('#cartContent').innerHTML=`<button class="closebtn" id="cartClose" aria-label="Close cart">✕</button><section class="checkout-review"><h2>Review your order</h2>${message?`<p role="alert">${escapeHtml(message)}</p>`:''}<p>${escapeHtml(order.customerName)} · ${escapeHtml(order.phone)}</p><p>${escapeHtml(order.address)}</p><ul>${q.items.map(x=>`<li>${escapeHtml(x.name)}${x.size ? ` (Size: ${escapeHtml(x.size)})` : ''} × ${x.qty} — ${money(x.lineTotal)}</li>`).join('')}</ul><div class="cart-total-box"><div class="row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div><div class="row"><span>Discount</span><span>−${money(q.discount)}</span></div><div class="row"><span>Delivery</span><span>${money(q.deliveryCharge)}</span></div><div class="row"><span>Cash on Delivery fee</span><span>${money(q.codCharge)}</span></div><div class="row total"><span>Total</span><span>${money(q.correctedTotal)}</span></div></div><p>${order.paymentMethod==='UPI'?'UPI payment opens after your order is saved with the confirmed total.':'Payment is due at delivery.'}</p><button class="primary-btn" id="confirmOrderBtn">Confirm order</button><button class="ghost-btn" id="editCheckoutBtn">Edit details</button></section>`;
  $('#cartClose').onclick=closeCart;
  $('#editCheckoutBtn').onclick=()=>{if(checkoutBusy)return;checkoutQuote=null;renderCartDrawer();$('#custName')?.focus();};
  $('#confirmOrderBtn').onclick=confirmCheckout;
  $('#confirmOrderBtn').focus();
}
async function confirmCheckout(){
  if(navigator.locks?.request) return navigator.locks.request('dsb-checkout',confirmCheckoutUnlocked);
  return confirmCheckoutUnlocked();
}
async function confirmCheckoutUnlocked(){
  if(checkoutBusy || !checkoutQuote)return;
  // An uncertain previous attempt must be checked before any new request ID is created.
  try { pendingCheckout=JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null'); } catch(_){}
  if(pendingCheckout){renderPendingCheckout();return;}
  const cart=CartStore.getAll();
  if(checkoutQuote.order.itemsDetail.some(x=>!cart[sizeCartKey(x.id,x.size)] || cart[sizeCartKey(x.id,x.size)].qty<x.qty)){checkoutQuote=null;renderCartDrawer();showCheckoutError('Your cart changed in another tab. Please review it again.');return;}
  pendingCheckout={requestId:newCheckoutId(),order:checkoutQuote.order,quoteToken:checkoutQuote.quote.quoteToken,expectedQuote:checkoutQuote.quote};
  try {localStorage.setItem(PENDING_CHECKOUT_KEY,JSON.stringify(pendingCheckout));}
  catch(_){pendingCheckout=null;showCheckoutError('Allow browser storage to place an order safely, or contact the shop.');return;}
  await sendPendingCheckout();
}
async function sendPendingCheckout(){
  if(checkoutBusy || !pendingCheckout)return;
  checkoutBusy=true;renderPendingCheckout();
  try{
    const p=pendingCheckout;
    const data=await postCheckout('addOrder',{order:{...p.order,requestId:p.requestId,quoteToken:p.quoteToken,expectedQuote:p.expectedQuote}});
    if(data.success===true && data.orderId){await completeCheckout(data,p.order);return;}
    if(data.code==='quote_changed' && data.quote){
      clearPendingCheckout();checkoutQuote={order:p.order,quote:data.quote};renderCheckoutReview(data.error);return;
    }
    // Only explicit pre-commit validation failures let the shopper edit immediately.
    if(['invalid_promo','invalid_size','insufficient_stock','upgrade_required','validation_failed'].includes(data.code)){
      clearPendingCheckout();checkoutQuote=null;renderCartDrawer();showCheckoutError(data.error);return;
    }
    renderPendingCheckout(data.error || 'Please check this order before trying again.');
  }catch(err){renderPendingCheckout('The connection was interrupted. Check this order before placing another one.');}
  finally{checkoutBusy=false;$('#retryCheckoutBtn')?.removeAttribute('disabled');}
}
let pendingFeedbackTimer;
function renderPendingCheckout(message=''){
  clearTimeout(pendingFeedbackTimer);
  $('#cartContent').innerHTML=`<button class="closebtn" id="cartClose" aria-label="Close cart">✕</button><section class="checkout-review">${checkoutBusy && !message ? '<div class="checkout-wait-art" aria-hidden="true"><div class="checkout-wait-ring"></div><span>🛍️</span></div>' : ''}<h2>Checking your order</h2><p role="status">${escapeHtml(message || (checkoutBusy?'Checking availability and saving your order…':'A previous order attempt needs to be checked.'))}</p><p>Checking again will not create a duplicate order.</p><button class="primary-btn" id="retryCheckoutBtn" ${checkoutBusy?'disabled':''}>Check order status</button></section>`;
  $('#cartClose').onclick=closeCart;$('#retryCheckoutBtn').onclick=checkPendingCheckout;
  if(checkoutBusy && !message)pendingFeedbackTimer=setTimeout(()=>{const status=$('#cartContent .checkout-review [role="status"]');if(status && checkoutBusy)status.textContent='Taking longer than usual. Your order may still be saving.';},10000);
  if(!checkoutBusy)$('#retryCheckoutBtn').focus();
}
async function checkPendingCheckout(){
  if(checkoutBusy || !pendingCheckout)return;
  checkoutBusy=true;renderPendingCheckout();
  try{
    const p=pendingCheckout,data=await postCheckout('orderResult',{requestId:p.requestId,phone:p.order.phone});
    if(data.success && data.orderId){await completeCheckout(data,p.order);return;}
    if(data.code==='not_found'){
      renderPendingCheckout('No saved order was found yet. Retry this same order safely.');
      $('#retryCheckoutBtn').textContent='Retry same order';
      $('#retryCheckoutBtn').onclick=sendPendingCheckout;
    }else renderPendingCheckout(data.error || 'Still checking. Please try again shortly.');
  }catch(err){renderPendingCheckout('Could not check your order yet. Please try again shortly.');}
  finally{checkoutBusy=false;$('#retryCheckoutBtn')?.removeAttribute('disabled');}
}
function clearPendingCheckout(){pendingCheckout=null;try{localStorage.removeItem(PENDING_CHECKOUT_KEY);}catch(_){}}
async function completeCheckout(data,order){
  lastReceipt={orderId:data.orderId,orderDate:data.orderDate,name:order.customerName,phone:order.phone,address:order.address,paymentMethod:order.paymentMethod,promoCode:data.promoCode || '',subtotal:data.subtotal,discount:data.discount,deliveryCharge:data.deliveryCharge,codCharge:data.codCharge,total:data.correctedTotal,items:data.items};
  try { localStorage.setItem('dsb_last_receipt_v2',JSON.stringify(lastReceipt)); } catch(_){}
  // Clear only quantities actually ordered. Items added in another tab are preserved.
  await CartStore.consumeSafe(order.itemsDetail,data.orderId);
  clearPendingCheckout();checkoutQuote=null;checkoutState.promoInput='';checkoutState.appliedPromo=null;checkoutState.promoStatus='';
  try{sessionStorage.removeItem(CATALOG_SESSION_KEY);}catch(_){}
  updateCartBadge();renderOrderConfirmation(lastReceipt);
  if(typeof renderGrid==='function')renderGrid();
  if(typeof refreshCurrentProductCard==='function')refreshCurrentProductCard();
  if(typeof loadAllProducts==='function') loadAllProducts({force:true}).then(()=>{
    if(typeof CURRENT_PRODUCT!=='undefined' && CURRENT_PRODUCT) CURRENT_PRODUCT=ALL_PRODUCTS.find(p=>p.id===CURRENT_PRODUCT.id) || null;
    if(typeof renderGrid==='function')renderGrid();
    if(typeof renderHomeCarousels==='function')renderHomeCarousels();
    if(typeof refreshCurrentProductCard==='function')refreshCurrentProductCard();
  }).catch(()=>{});
}
