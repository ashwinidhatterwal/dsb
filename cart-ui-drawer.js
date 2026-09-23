/* Cart drawer rendering. Requires cart-ui-core.js. */
/* ---------------- Cart drawer ---------------- */
function renderCartDrawer() {
  const wrap = $('#cartContent');
  if (pendingCheckout) {
    renderPendingCheckout();
    return;
  }
  if (checkoutQuote) {
    renderCheckoutReview();
    return;
  }
  const focusId = wrap.contains(document.activeElement) ? document.activeElement.id : '';
  const previousScroll = $('#cartMain') ? $('#cartMain').scrollTop : 0;
  const cart = CartStore.getAll();
  const items = Object.values(cart);
  try {
    if (!lastReceipt) lastReceipt = JSON.parse(localStorage.getItem('dsb_last_receipt_v2') || 'null');
  } catch (_) {}
  if (!items.length) {
    wrap.innerHTML = `
      <div class="cart-header">
        <div><span class="cart-eyebrow">SHOPPING BAG</span><h2>Your cart</h2><button type="button" class="ghost-btn" id="forgetCheckoutInfo">Forget saved checkout details</button></div>
        <button class="closebtn" id="cartClose" aria-label="Close cart">✕</button>
      </div>
      <div class="cart-main" id="cartMain">${cartAdjustmentHtml()}
        <div class="cart-empty"><div class="cart-empty-icon">🛍️</div><strong>Your cart is empty</strong><br><span>Add a few things from the shop and they will appear here.</span></div>
      </div>`;
    $('#cartClose').addEventListener('click', closeCart);
    if (lastReceipt) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost-btn';
      b.textContent = 'View last order';
      b.onclick = () => window.location.assign('thank-you.html');
      wrap.appendChild(b);
    }
    return;
  }
  window.DSBAnalytics?.beginCheckout?.(items.map(({ product, qty }) => ({ productId: product.productId || product.id, name: product.name, category: product.category, size: product.size || '', unitPrice: product.price, qty })), checkoutState.paymentMethod);
  const subtotal = CartStore.total();
  const {
    discount,
    merchandiseTotal,
    deliveryCharge,
    codCharge,
    grandTotal
  } = computeCheckoutTotals(subtotal);
  const showUpi = !!CONFIG.UPI_ID;
  const upiSaving = Math.max(0, Number(checkoutState.feeConfig?.codCharge) || 0);
  wrap.innerHTML = `
    <div class="cart-header">
      <div><span class="cart-eyebrow">SHOPPING BAG · ${CartStore.count()} ITEM${CartStore.count() === 1 ? '' : 'S'}</span><h2>Your cart</h2><button type="button" class="ghost-btn" id="forgetCheckoutInfo">Forget saved checkout details</button></div>
      <button class="closebtn" id="cartClose" aria-label="Close cart">✕</button>
    </div>
    <div class="cart-main" id="cartMain">${cartAdjustmentHtml()}
      <section class="cart-items-section">
        <div class="cart-section-head"><span>Items in your cart</span><span>${CartStore.count()} item${CartStore.count() === 1 ? '' : 's'}</span></div>
        <div id="cartItems">
          ${items.map(({
    product,
    qty
  }) => `
            <div class="cart-item" data-id="${escapeHtml(product.id)}">
              <img src="${escapeHtml(productImageUrl(product.image, 160))}" loading="lazy" decoding="async" alt="${escapeHtml(product.name)}">
              <div class="ci-info">
                <div class="ci-name">${escapeHtml(product.name)}</div>
                <div class="ci-id">${product.size ? `<span>Size: ${escapeHtml(product.size)}</span> · ` : ''}${money(product.price)} each</div>
                <div class="ci-price">${money(product.price * qty)}</div>
              </div>
              <div class="cart-item-actions">
                <div class="stepper" data-id="${escapeHtml(product.id)}">
                  <button type="button" data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-act="inc" aria-label="Increase quantity" ${product.stockQty !== null && cartStockUsed(product) >= product.stockQty ? 'disabled' : ''}>+</button>
                </div>
                <button type="button" class="cart-remove" data-act="remove" data-id="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(product.name)}">Remove</button>
              </div>
            </div>`).join('')}
        </div>
      </section>

      <div class="cart-summary">
        <div class="cart-checkout-title"><div><span class="cart-eyebrow">CHECKOUT</span><h3>Delivery details</h3></div></div>
        <div class="field">
          <div id="customerAddressSlot"></div>${window.DSBAccount?.enabled ? '<p class="hint"><a href="profile.html">My account / मेरा खाता</a> · Save your details for next time / अगली बार के लिए जानकारी सेव करें</p>' : ''}
          <label for="custName">Your name</label>
          <input type="text" id="custName" maxlength="100" placeholder="Full name" autocomplete="name" value="${escapeHtml(checkoutState.name)}">
        </div>
        <div class="field">
          <label for="custPhone">Phone number</label>
          <input type="tel" id="custPhone" maxlength="25" placeholder="10-digit mobile number" autocomplete="tel" inputmode="numeric" value="${escapeHtml(checkoutState.phone)}">
        </div>
        <div class="field">
          <label for="custAddress">Delivery address</label>
          <textarea id="custAddress" maxlength="500" autocomplete="street-address" placeholder="House no, street, village/city">${escapeHtml(checkoutState.address)}</textarea>
        </div>
        <div class="field">
          <label for="custPinCode">PIN code (required)</label>
          <input type="text" id="custPinCode" required aria-required="true" inputmode="numeric" autocomplete="postal-code" pattern="[1-9][0-9]{5}" maxlength="6" placeholder="6-digit PIN code" value="${escapeHtml(checkoutState.pinCode)}">
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
            ${showUpi ? `<label class="pay-option pay-option-upi"><input type="radio" name="payMethod" value="UPI" ${checkoutState.paymentMethod === 'UPI' ? 'checked' : ''}> <span class="pay-option-copy"><span>Pay via UPI</span>${upiSaving > 0 ? `<small class="upi-saving">Save ${money(upiSaving)} compared with COD</small>` : ''}</span></label>` : ''}
            <label class="pay-option"><input type="radio" name="payMethod" value="COD" ${checkoutState.paymentMethod === 'COD' ? 'checked' : ''}> <span>Cash on Delivery</span></label>
          </div>
          ${showUpi && checkoutState.paymentMethod === 'UPI' ? '<p class="hint">UPI payment opens after your order is saved with the confirmed total.</p>' : ''}
        </div>
        <div class="cart-total-box">
          <div class="row"><span>Items</span><span>${CartStore.count()}</span></div>
          <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          ${discount > 0 ? `<div class="row"><span>Discount</span><span>−${money(discount)}</span></div>` : ''}
          ${deliveryCharge > 0 ? `<div class="row"><span>Delivery</span><span>${money(deliveryCharge)}</span></div>` : ''}
          ${codCharge > 0 ? `<div class="row"><span>Cash on Delivery fee</span><span>${money(codCharge)}</span></div>` : ''}
          ${checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 && deliveryCharge === 0 ? `<div class="row fee-free"><span>Delivery</span><span>FREE</span></div>` : ''}
          <div class="row total"><span>${checkoutState.feeConfig ? 'Estimated total' : 'Subtotal — fees checked next'}</span><span>${money(grandTotal)}</span></div>
        </div>
        ${checkoutState.feeConfig && checkoutState.feeConfig.deliveryCharge > 0 ? `<p class="checkout-fee-note">Free delivery on orders of ${money(checkoutState.feeConfig.deliveryFreeAbove)} or more.</p>` : ''}
        <div class="checkout-honeypot" aria-hidden="true"><label>Website<input id="orderWebsite" tabindex="-1" autocomplete="off"></label></div><button class="primary-btn" id="orderWaBtn" type="button">Review order</button>
        <button class="ghost-btn cart-clear" id="clearCartBtn" type="button">Clear cart</button>
      </div>
    </div>`;
  $('#cartClose').addEventListener('click', closeCart);
  $$('.stepper', wrap).forEach(stepper => {
    const id = stepper.dataset.id;
    const entry = cart[id];
    if (!entry) return;
    $('[data-act="inc"]', stepper).addEventListener('click', async () => {
      if (entry.product.stockQty !== null && cartStockUsed(entry.product) >= entry.product.stockQty) {
        showToast(`Only ${entry.product.stockQty} in stock`);
        return;
      }
      await CartStore.addSafe(entry.product, 1);
      updateCartBadge();
      renderCartDrawer();
    });
    $('[data-act="dec"]', stepper).addEventListener('click', async () => {
      await CartStore.addSafe(entry.product, -1);
      updateCartBadge();
      renderCartDrawer();
    });
  });
  $$('.cart-remove', wrap).forEach(btn => btn.addEventListener('click', async () => {
    const entry = cart[btn.dataset.id];
    if (!entry) return;
    await CartStore.addSafe(entry.product, -entry.qty);
    updateCartBadge();
    renderCartDrawer();
  }));
  $('#forgetCheckoutInfo')?.addEventListener('click', forgetSavedCheckoutInfo);
  renderCustomerAddressChoices();
  $('#custName').addEventListener('input', e => {
    checkoutState.name = e.target.value;
    saveCheckoutInfo();
  });
  $('#custPhone').addEventListener('input', e => {
    checkoutState.phone = e.target.value;
    saveCheckoutInfo();
  });
  $('#custAddress').addEventListener('input', e => {
    checkoutState.address = e.target.value;
    saveCheckoutInfo();
  });
  $('#custPinCode').addEventListener('input', e => {
    checkoutState.pinCode = e.target.value;
    saveCheckoutInfo();
  });
  $('#promoInput').addEventListener('input', e => {
    checkoutState.promoInput = e.target.value;
  });
  $('#applyPromoBtn').addEventListener('click', applyPromoCode);
  $$('input[name="payMethod"]', wrap).forEach(radio => radio.addEventListener('change', e => {
    checkoutState.paymentMethod = e.target.value;
    saveCheckoutInfo();
    renderCartDrawer();
  }));
  $('#orderWaBtn').addEventListener('click', submitOrder);
  $('#clearCartBtn').addEventListener('click', async () => {
    if (confirm('Clear all items from your cart?')) {
      await CartStore.clearSafe();
      updateCartBadge();
      renderCartDrawer();
    }
  });
  requestAnimationFrame(() => {
    const main = $('#cartMain');
    if (main) main.scrollTop = Math.min(previousScroll, main.scrollHeight);
    if (focusId) document.getElementById(focusId)?.focus({
      preventScroll: true
    });
  });
}
const PENDING_CHECKOUT_KEY = 'dsb_pending_checkout_v2';
let checkoutBusy = false,
  checkoutQuote = null,
  pendingCheckout = null;
try {
  pendingCheckout = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null');
} catch (_) {}
if (pendingCheckout && (!pendingCheckout.order || !pendingCheckout.requestId)) pendingCheckout = null;
