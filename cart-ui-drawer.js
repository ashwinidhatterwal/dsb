/* Cart drawer rendering, confirmation and receipt UI. Requires cart-ui-core.js. */
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
        <div><span class="cart-eyebrow">SHOPPING BAG</span><h2>Your cart</h2></div>
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
      b.onclick = () => renderOrderConfirmation(lastReceipt);
      wrap.appendChild(b);
    }
    return;
  }
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
      <div><span class="cart-eyebrow">SHOPPING BAG · ${CartStore.count()} ITEM${CartStore.count() === 1 ? '' : 'S'}</span><h2>Your cart</h2></div>
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
      if (entry.product.stockQty !== null && CartStore.qtyForProduct(entry.product.productId || entry.product.id) >= entry.product.stockQty) {
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
function renderOrderConfirmation(receipt) {
  const wrap = $('#cartContent');
  const orderId = receipt && receipt.orderId ? receipt.orderId : '';
  const shopPhone = formatShopPhone(CONFIG.WHATSAPP_NUMBER);
  const isUpi = receipt.paymentMethod === 'UPI' && CONFIG.UPI_ID;
  // A short, concrete "what happens next" — replaces a single vague line.
  // Step 1 is already true by the time this screen shows; step 2 tells the
  // customer exactly which channel and which number to expect contact from,
  // so a real shop message doesn't look like a scam text.
  const stepsHtml = `
    <ol class="confirm-steps">
      <li class="done"><span class="step-dot">✓</span><div><strong>Order saved</strong><span>Your items, address and total are recorded.</span></div></li>
      <li><span class="step-dot">2</span><div><strong>Confirmation on WhatsApp</strong><span>${shopPhone ? `We'll message you from <strong>${escapeHtml(shopPhone)}</strong>` : "We'll message you on WhatsApp"} to confirm your delivery details${isUpi ? ' and payment' : ''} before it's dispatched.</span></div></li>
      <li><span class="step-dot">3</span><div><strong>Delivery</strong><span>${isUpi ? "Once confirmed, we'll get your order ready and out for delivery." : `Pay ${money(receipt.total)} in cash when your order arrives.`}</span></div></li>
    </ol>`;
  const paymentBox = isUpi ? `<div class="upi-box"><p><strong>Payment not yet confirmed.</strong> Use the link below to pay ${money(receipt.total)} — the shop checks and confirms your payment manually on WhatsApp, it isn't automatic. Already paid for this order? Please don't pay again.</p><div class="upi-qr" id="upiQr" role="img" aria-label="UPI payment QR code">Preparing payment QR…</div><a class="primary-btn" href="${escapeHtml(buildUpiLink(receipt.total, orderId))}">Open UPI app</a><p class="hint">UPI ID: ${escapeHtml(CONFIG.UPI_ID)} · Reference: ${escapeHtml(orderId)}</p></div>` : '';
  wrap.innerHTML = `
    <button class="closebtn" id="cartClose" aria-label="Close">✕</button>
    <div class="order-confirm" data-i18n-skip>
      <div class="confirm-icon">✓</div>
      <h2>Your order has been received</h2>
      ${orderId ? `<p class="confirm-id">Order ID: <strong>${escapeHtml(orderId)}</strong></p>` : ''}
      <p><strong>Order total: ${money(receipt.total)}</strong></p>
      ${stepsHtml}
      ${paymentBox}
      <div class="confirm-actions">
        ${orderId ? `<button class="ghost-btn" id="confirmTrackBtn" type="button">📦 Track this order</button>` : ''}
        <button class="primary-btn" id="downloadReceiptBtn" type="button">⬇ Download order slip</button>
        <button class="ghost-btn" id="printReceiptBtn" type="button">Print / Save as PDF</button>
        <button class="ghost-btn" id="confirmCloseBtn" type="button">Continue shopping</button>
      </div>
    </div>`;
  const close = () => closeCart();
  $('#cartClose').addEventListener('click', close);
  $('#confirmCloseBtn').addEventListener('click', close);
  $('#downloadReceiptBtn').addEventListener('click', () => downloadReceipt(receipt));
  $('#printReceiptBtn').addEventListener('click', () => downloadReceipt(receipt, true));
  $('#confirmTrackBtn')?.addEventListener('click', () => goToTrackOrder(orderId));
  document.dispatchEvent(new CustomEvent('dsb:ordercomplete'));
  $('#downloadReceiptBtn').focus();
  if (isUpi) renderPaymentQr(buildUpiLink(receipt.total, orderId));
}
function downloadReceipt(receipt, print = false) {
  if (!receipt) return;
  const isUpi = receipt.paymentMethod === 'UPI';
  const paymentNote = isUpi ? `<div class="notice"><strong>Important:</strong> This is an order confirmation slip only. It is <strong>not a payment receipt</strong> and does not confirm that a UPI payment was received.</div>` : `<div class="notice"><strong>Payment:</strong> Cash on Delivery selected. Payment is due at delivery.</div>`;
  const itemRows = (receipt.items || []).map(item => `
    <tr><td>${escapeHtml(item.name)}${item.size ? ` (Size: ${escapeHtml(item.size)})` : ''}</td><td>${Number(item.qty) || 0}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>`).join('');
  const feeRows = `${receipt.discount > 0 ? `<tr><td colspan="3">Discount${receipt.promoCode ? ` (${escapeHtml(receipt.promoCode)})` : ''}</td><td>−${money(receipt.discount)}</td></tr>` : ''}
    ${receipt.deliveryCharge > 0 ? `<tr><td colspan="3">Delivery</td><td>${money(receipt.deliveryCharge)}</td></tr>` : ''}
    ${receipt.codCharge > 0 ? `<tr><td colspan="3">Cash on Delivery fee</td><td>${money(receipt.codCharge)}</td></tr>` : ''}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Confirmation ${escapeHtml(receipt.orderId)}</title><style>body{font-family:Arial,sans-serif;color:#222;max-width:760px;margin:40px auto;padding:0 20px}h1{margin:0 0 6px}p{line-height:1.5}.muted{color:#666}.notice{margin:16px 0;padding:12px 14px;border:1px solid #ddd;border-radius:10px;background:#fff8e8;line-height:1.5}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:10px 8px;border-bottom:1px solid #ddd;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.total td{font-size:18px;font-weight:700;border-top:2px solid #222}.box{background:#f7f7f7;padding:14px;border-radius:10px;margin:16px 0}@media print{body{margin:0}.no-print{display:none}}</style></head><body><h1>${escapeHtml(CONFIG.SHOP_NAME)}</h1><p class="muted"><strong>Order Confirmation Slip</strong></p><div class="box"><strong>Order ID:</strong> ${escapeHtml(receipt.orderId)}<br><strong>Date:</strong> ${escapeHtml(formatDateTime(receipt.orderDate || new Date()))}<br><strong>Customer:</strong> ${escapeHtml(receipt.name)}<br><strong>Phone:</strong> ${escapeHtml(receipt.phone)}<br><strong>Address:</strong> ${escapeHtml(receipt.address)}<br><strong>Payment method:</strong> ${escapeHtml(receipt.paymentMethod)}</div>${paymentNote}<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>${itemRows}<tr><td colspan="3">Subtotal</td><td>${money(receipt.subtotal)}</td></tr>${feeRows}<tr class="total"><td colspan="3">Order total</td><td>${money(receipt.total)}</td></tr></tbody></table><p>Thank you for shopping with ${escapeHtml(CONFIG.SHOP_NAME)}.</p><p class="muted">This document confirms the order details recorded by the store website.</p></body></html>`;
  if (print) {
    const frame = document.createElement('iframe');
    frame.title = 'Order slip';
    frame.className = 'receipt-print-frame';
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), {
      once: true
    });
    setTimeout(() => frame.remove(), 120000);
    return;
  }
  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `order-confirmation-${String(receipt.orderId || 'order').replace(/[^a-z0-9_-]/gi, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const PENDING_CHECKOUT_KEY = 'dsb_pending_checkout_v2';
let checkoutBusy = false,
  checkoutQuote = null,
  pendingCheckout = null;
try {
  pendingCheckout = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null');
} catch (_) {}
if (pendingCheckout && (!pendingCheckout.order || !pendingCheckout.requestId)) pendingCheckout = null;
