/* Checkout submission, recovery and payment QR. Requires cart-ui-core.js + cart-ui-drawer.js. */
async function postCheckout(action, body) {
  if (!CONFIG.SHEET_API_URL) throw new Error('Checkout is unavailable in demo mode.');
  return requestJson(CONFIG.SHEET_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action,
      ...body
    })
  }, 30000);
}
function checkoutOrderFromForm() {
  return {
    customerName: checkoutState.name.trim(),
    phone: checkoutState.phone.trim(),
    address: checkoutState.address.trim() + '\nPIN: ' + checkoutState.pinCode.trim(),
    pinCode: checkoutState.pinCode.trim(),
    paymentMethod: checkoutState.paymentMethod === 'UPI' ? 'UPI' : 'Cash on Delivery',
    promoCode: checkoutState.appliedPromo?.code || '',
    itemsDetail: Object.values(CartStore.getAll()).map(({
      product,
      qty
    }) => ({
      id: product.productId || product.id,
      qty,
      ...(product.size ? {
        size: product.size
      } : {})
    })),
    website: $('#orderWebsite')?.value || ''
  };
}
function validateCheckoutDetails(order) {
  const streetAddress = order.address.replace(/\nPIN: [^\n]*$/, '').trim();
  if (order.customerName.length < 2 || order.customerName.length > 100) return {
    field: 'custName',
    message: 'Enter a name of 2–100 characters.'
  };
  const digits = order.phone.replace(/\D/g, '');
  if (!/^[+\d\s()-]+$/.test(order.phone) || !/^\d{10,15}$/.test(digits)) return {
    field: 'custPhone',
    message: 'Enter a valid phone number with 10–15 digits.'
  };
  if (streetAddress.length < 5 || order.address.length > 500) return {
    field: 'custAddress',
    message: 'Enter a complete delivery address of 5–500 characters.'
  };
  if (!/^[1-9][0-9]{5}$/.test(order.pinCode || '')) return {
    field: 'custPinCode',
    message: 'Enter a valid 6-digit PIN code.'
  };
  if (streetAddress.length > 488) return {
    field: 'custAddress',
    message: 'Please shorten your address to 488 characters to leave room for the PIN code.'
  };
  if (order.itemsDetail.length > 50) return {
    field: 'cartItems',
    message: 'Please place a smaller order with up to 50 different items.'
  };
  return null;
}
async function submitOrder() {
  if (checkoutBusy) return;
  const order = checkoutOrderFromForm();
  if (!order.itemsDetail.length) return;
  const problem = validateCheckoutDetails(order);
  if (problem) {
    showCheckoutError(problem.message);
    document.getElementById(problem.field)?.focus();
    return;
  }
  if (checkoutState.feeConfig) {
    const subtotal = CartStore.total(),
      totals = computeCheckoutTotals(subtotal);
    const items = Object.values(CartStore.getAll()).map(({
      product,
      qty
    }) => ({
      id: product.productId || product.id,
      name: product.name,
      qty,
      ...(product.size ? {
        size: product.size
      } : {}),
      unitPrice: Number(product.price),
      lineTotal: Math.round(Number(product.price) * qty * 100) / 100
    }));
    checkoutQuote = {
      order,
      quote: {
        subtotal,
        discount: totals.discount,
        deliveryCharge: totals.deliveryCharge,
        codCharge: totals.codCharge,
        correctedTotal: totals.grandTotal,
        items
      }
    };
    renderCheckoutReview();
    return;
  }
  checkoutBusy = true;
  const btn = $('#orderWaBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Checking stock…';
  }
  try {
    const data = await postCheckout('quoteOrder', {
      order
    });
    if (data.success !== true || !data.quoteToken) throw new Error(data.error || 'Checkout needs an update. Please contact the shop.');
    checkoutQuote = {
      order,
      quote: data
    };
    renderCheckoutReview();
  } catch (err) {
    showCheckoutError(err.message);
  } finally {
    checkoutBusy = false;
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.textContent = 'Review order';
    }
  }
}
function showCheckoutError(message) {
  let el = $('#checkoutError');
  if (!el) {
    el = document.createElement('p');
    el.id = 'checkoutError';
    el.className = 'statusline err';
    el.setAttribute('role', 'alert');
    $('#cartContent').appendChild(el);
  }
  el.textContent = message;
  el.scrollIntoView({
    block: 'nearest'
  });
}
function renderCheckoutReview(message = '') {
  if (!checkoutQuote) return;
  const {
    order,
    quote: q
  } = checkoutQuote;
  $('#cartContent').innerHTML = `<button class="closebtn" id="cartClose" aria-label="Close cart">✕</button><section class="checkout-review"><h2>Review your order</h2>${message ? `<p role="alert">${escapeHtml(message)}</p>` : ''}<p>${escapeHtml(order.customerName)} · ${escapeHtml(order.phone)}</p><p>${escapeHtml(order.address)}</p><ul>${q.items.map(x => `<li>${escapeHtml(x.name)}${x.size ? ` (Size: ${escapeHtml(x.size)})` : ''} × ${x.qty} — ${money(x.lineTotal)}</li>`).join('')}</ul><div class="cart-total-box"><div class="row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div><div class="row"><span>Discount</span><span>−${money(q.discount)}</span></div><div class="row"><span>Delivery</span><span>${money(q.deliveryCharge)}</span></div><div class="row"><span>Cash on Delivery fee</span><span>${money(q.codCharge)}</span></div><div class="row total"><span>Total</span><span>${money(q.correctedTotal)}</span></div></div><p>${order.paymentMethod === 'UPI' ? 'UPI payment opens after your order is saved with the confirmed total.' : 'Payment is due at delivery.'}</p><button class="primary-btn" id="confirmOrderBtn">Confirm order</button><button class="ghost-btn" id="editCheckoutBtn">Edit details</button></section>`;
  $('#cartClose').onclick = closeCart;
  $('#editCheckoutBtn').onclick = () => {
    if (checkoutBusy) return;
    checkoutQuote = null;
    renderCartDrawer();
    $('#custName')?.focus();
  };
  $('#confirmOrderBtn').onclick = confirmCheckout;
  $('#confirmOrderBtn').focus();
}
async function confirmCheckout() {
  if (navigator.locks?.request) return navigator.locks.request('dsb-checkout', confirmCheckoutUnlocked);
  return confirmCheckoutUnlocked();
}
async function confirmCheckoutUnlocked() {
  if (checkoutBusy || !checkoutQuote) return;
  window.DSBAnalytics?.track('begin_checkout', {
    items: checkoutQuote.order.itemsDetail.length,
    payment: checkoutQuote.order.paymentMethod,
    total: Number(checkoutQuote.quote.correctedTotal || 0),
    cartItems: checkoutQuote.quote.items || []
  });
  // An uncertain previous attempt must be checked before any new request ID is created.
  try {
    pendingCheckout = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null');
  } catch (_) {}
  if (pendingCheckout) {
    renderPendingCheckout();
    return;
  }
  const cart = CartStore.getAll();
  if (checkoutQuote.order.itemsDetail.some(x => !cart[sizeCartKey(x.id, x.size)] || cart[sizeCartKey(x.id, x.size)].qty < x.qty)) {
    checkoutQuote = null;
    renderCartDrawer();
    showCheckoutError('Your cart changed in another tab. Please review it again.');
    return;
  }
  pendingCheckout = {
    requestId: newCheckoutId(),
    order: checkoutQuote.order,
    quoteToken: checkoutQuote.quote.quoteToken,
    expectedQuote: checkoutQuote.quote,
    analytics: window.DSBAnalytics?.context?.() || null
  };
  try {
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pendingCheckout));
  } catch (_) {
    pendingCheckout = null;
    showCheckoutError('Allow browser storage to place an order safely, or contact the shop.');
    return;
  }
  await sendPendingCheckout();
}
async function sendPendingCheckout() {
  if (checkoutBusy || !pendingCheckout) return;
  checkoutBusy = true;
  renderPendingCheckout();
  try {
    const p = pendingCheckout;
    const data = await postCheckout('addOrder', {
      order: {
        ...p.order,
        requestId: p.requestId,
        quoteToken: p.quoteToken,
        expectedQuote: p.expectedQuote,
        analyticsContext: p.analytics || null
      }
    });
    if (data.success === true && data.orderId) {
      await completeCheckout(data, p.order);
      return;
    }
    if (data.code === 'quote_changed' && data.quote) {
      clearPendingCheckout();
      checkoutQuote = {
        order: p.order,
        quote: data.quote
      };
      renderCheckoutReview(data.error);
      return;
    }
    // Only explicit pre-commit validation failures let the shopper edit immediately.
    if (['invalid_promo', 'invalid_size', 'insufficient_stock', 'upgrade_required', 'validation_failed', 'rate_limited'].includes(data.code)) {
      clearPendingCheckout();
      checkoutQuote = null;
      renderCartDrawer();
      showCheckoutError(data.error);
      return;
    }
    renderPendingCheckout(data.error || 'Please check this order before trying again.');
  } catch (err) {
    renderPendingCheckout('The connection was interrupted. Check this order before placing another one.');
  } finally {
    checkoutBusy = false;
    $('#retryCheckoutBtn')?.removeAttribute('disabled');
  }
}
let pendingFeedbackTimer;
function renderPendingCheckout(message = '') {
  clearTimeout(pendingFeedbackTimer);
  $('#cartContent').innerHTML = `<button class="closebtn" id="cartClose" aria-label="Close cart">✕</button><section class="checkout-review">${checkoutBusy && !message ? '<div class="checkout-wait-art" aria-hidden="true"><div class="checkout-wait-ring"></div><span>🛍️</span></div>' : ''}<h2>Checking your order</h2><p role="status">${escapeHtml(message || (checkoutBusy ? 'Checking availability and saving your order…' : 'A previous order attempt needs to be checked.'))}</p><p>Checking again will not create a duplicate order.</p><button class="primary-btn" id="retryCheckoutBtn" ${checkoutBusy ? 'disabled' : ''}>Check order status</button></section>`;
  $('#cartClose').onclick = closeCart;
  $('#retryCheckoutBtn').onclick = checkPendingCheckout;
  if (checkoutBusy && !message) pendingFeedbackTimer = setTimeout(() => {
    const status = $('#cartContent .checkout-review [role="status"]');
    if (status && checkoutBusy) status.textContent = 'Taking longer than usual. Your order may still be saving.';
  }, 10000);
  if (!checkoutBusy) $('#retryCheckoutBtn').focus();
}
async function checkPendingCheckout() {
  if (checkoutBusy || !pendingCheckout) return;
  checkoutBusy = true;
  renderPendingCheckout();
  try {
    const p = pendingCheckout,
      data = await postCheckout('orderResult', {
        requestId: p.requestId,
        phone: p.order.phone
      });
    if (data.success && data.orderId) {
      await completeCheckout(data, p.order);
      return;
    }
    if (data.code === 'not_found') {
      renderPendingCheckout('No saved order was found yet. Retry this same order safely.');
      $('#retryCheckoutBtn').textContent = 'Retry same order';
      $('#retryCheckoutBtn').onclick = sendPendingCheckout;
    } else renderPendingCheckout(data.error || 'Still checking. Please try again shortly.');
  } catch (err) {
    renderPendingCheckout('Could not check your order yet. Please try again shortly.');
  } finally {
    checkoutBusy = false;
    $('#retryCheckoutBtn')?.removeAttribute('disabled');
  }
}
function clearPendingCheckout() {
  pendingCheckout = null;
  try {
    localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch (_) {}
}
async function completeCheckout(data, order) {
  lastReceipt = {
    orderId: data.orderId,
    orderDate: data.orderDate,
    name: order.customerName,
    phone: order.phone,
    address: order.address,
    paymentMethod: order.paymentMethod,
    promoCode: data.promoCode || '',
    subtotal: data.subtotal,
    discount: data.discount,
    deliveryCharge: data.deliveryCharge,
    codCharge: data.codCharge,
    total: data.correctedTotal,
    items: data.items
  };
  try {
    localStorage.setItem('dsb_last_receipt_v2', JSON.stringify(lastReceipt));
  } catch (_) {}
  // Clear only quantities actually ordered. Items added in another tab are preserved.
  await CartStore.consumeSafe(order.itemsDetail, data.orderId);
  cartAdjustments = {
    removed: [],
    adjusted: []
  };
  clearPendingCheckout();
  checkoutQuote = null;
  checkoutState.promoInput = '';
  checkoutState.appliedPromo = null;
  checkoutState.promoStatus = '';
  try {
    sessionStorage.removeItem(CATALOG_SESSION_KEY);
  } catch (_) {}
  updateCartBadge();
  window.DSBAnalytics?.track('order_completed', {
    transactionId: data.orderId,
    total: Number(data.correctedTotal || 0),
    items: order.itemsDetail.length,
    payment: order.paymentMethod,
    cartItems: data.items || []
  });
  document.dispatchEvent(new CustomEvent('dsb:ordercomplete'));
  // The receipt is already stored locally. Move checkout out of the cart drawer
  // into a dedicated confirmation page without customer data in the URL.
  window.location.assign('thank-you.html');
}
function cartAdjustmentHtml() {
  const {
    removed,
    adjusted
  } = cartAdjustments;
  if (!removed.length && !adjusted.length) return '';
  return `<section class="cart-change-notice" role="status"><strong>Your cart was updated</strong><ul>${removed.map(name => `<li>${escapeHtml(name)} — <span>No longer available</span>.</li>`).join('')}${adjusted.map(x => `<li>${escapeHtml(x.name)}${x.size ? ' (' + escapeHtml(x.size) + ')' : ''}: ${x.oldQty !== x.qty ? `<span>Quantity updated</span>: ${x.oldQty} → ${x.qty}. ` : ''}${x.oldPrice !== x.price ? `<span>Price updated</span>: ${money(x.oldPrice)} → ${money(x.price)}.` : ''}</li>`).join('')}</ul></section>`;
}
document.addEventListener('dsb:cartchange', () => {
  updateCartBadge();
  if (typeof updateVisibleCartActions === 'function') updateVisibleCartActions();
  if (typeof refreshCurrentProductCard === 'function') refreshCurrentProductCard();
});
window.addEventListener('storage', event => {
  if (event.key !== CART_STORAGE_KEY && event.key !== PENDING_CHECKOUT_KEY && event.key !== null) return;
  notifyCartChanged();
  if (checkoutBusy) return;
  try {
    pendingCheckout = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null');
  } catch (_) {}
  if ($('#cartOverlay')?.classList.contains('open') && !$('#downloadReceiptBtn')) renderCartDrawer();
});
