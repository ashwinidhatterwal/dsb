/* Dhatterwal Suhag Bhandar — dedicated customer order tracking. */
(() => {
  'use strict';

  const form = document.getElementById('trackPageForm');
  const orderField = document.getElementById('trackOrderId');
  const phoneField = document.getElementById('trackPhone');
  const submitBtn = document.getElementById('trackSubmitBtn');
  const errorEl = document.getElementById('trackError');
  const resultEl = document.getElementById('trackResult');

  function showError(message) {
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  }

  async function api(body) {
    if (typeof CONFIG === 'undefined' || !CONFIG.SHEET_API_URL) throw new Error('tracking_unavailable');
    const response = await fetch(CONFIG.SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'request_failed');
    return data;
  }

  async function fetchTrackedOrder(orderId, phone) {
    return api({ action: 'trackOrder', orderId, phone });
  }

  async function submitOrderRequest(credentials, type, message, statusEl) {
    statusEl.textContent = 'Sending request…';
    const data = await api({ action: 'submitOrderRequest', request: { ...credentials, type, message } });
    if (data?.error || data?.success === false) {
      if (data.error === 'cancellation_unavailable') throw new Error('Cancellation can no longer be requested online for this order. Please contact the shop.');
      if (data.error === 'message_required') throw new Error('Please enter a short message.');
      if (data.error === 'not_found') throw new Error('Order verification failed. Track the order again and retry.');
      throw new Error(data.error || 'Could not send the request.');
    }
    statusEl.textContent = data.duplicate ? 'You already have a pending request for this order.' : 'Request sent. The shop will review it.';
    const refreshed = await fetchTrackedOrder(credentials.orderId, credentials.phone);
    if (refreshed?.success) renderResult(refreshed, credentials);
  }

  function renderResult(order, credentials) {
    const status = String(order.status || 'Pending').trim();
    const statusLower = status.toLowerCase();
    const isCancelled = statusLower === 'cancelled';
    const stages = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
    const current = status === 'Fulfilled' ? 4 : stages.indexOf(status);
    const labels = ['Order received', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
    const stepsHtml = isCancelled
      ? '<div class="track-steps cancelled"><div class="track-step done"><span class="dot"></span>Order received</div><div class="track-step cancel"><span class="dot"></span>Cancelled</div></div>'
      : `<ol class="track-steps track-timeline">${labels.map((label, i) => `<li class="track-step ${i <= current ? 'done' : ''} ${i === current && current < 4 ? 'active' : ''}" ${i === current ? 'aria-current="step"' : ''}><span class="dot"></span>${label}</li>`).join('')}</ol>`;
    const waText = encodeURIComponent(`Hi, I have a question about my order ${order.orderId}`);

    resultEl.innerHTML = `
      <div class="track-card">
        <div class="track-card-head"><div><div class="track-oid">${escapeHtml(order.orderId)}</div><div class="track-odate">${escapeHtml(formatDateTime(order.date))}</div></div><span class="status-pill ${escapeHtml(statusLower)}">${escapeHtml(status)}</span></div>
        ${stepsHtml}
        <div class="track-details">
          ${order.items ? `<div class="row"><span>Items</span><span style="text-align:right;max-width:60%">${escapeHtml(order.items)}</span></div>` : ''}
          ${Number(order.discount) > 0 ? `<div class="row"><span>Discount</span><span>−${money(order.discount)}</span></div>` : ''}
          ${Number(order.deliveryCharge) > 0 ? `<div class="row"><span>Delivery</span><span>${money(order.deliveryCharge)}</span></div>` : ''}
          ${Number(order.codCharge) > 0 ? `<div class="row"><span>COD fee</span><span>${money(order.codCharge)}</span></div>` : ''}
          <div class="row total"><span>Total</span><span>${money(order.total)}</span></div>
          ${order.paymentMethod ? `<div class="row"><span>Payment</span><span>${escapeHtml(order.paymentMethod)}</span></div>` : ''}
        </div>
        ${order.shipment && (order.shipment.carrier || order.shipment.reference) ? `<p><strong>Shipment</strong>: ${escapeHtml(order.shipment.carrier)} · ${escapeHtml(order.shipment.reference)}</p>` : ''}
        ${/^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#][^\s<>]*)?$/i.test(order.shipment?.url || '') ? `<p><a class="ghost-btn" href="${escapeHtml(order.shipment.url)}" target="_blank" rel="noopener noreferrer">Track shipment</a></p>` : ''}
        <div class="track-request-panel">
          <strong>Need a change or help?</strong>
          <p class="hint">Requests are reviewed by the shop. Sending a cancellation request does not cancel the order instantly.</p>
          <div class="track-request-actions">
            ${order.canRequestCancellation ? '<button type="button" class="ghost-btn" id="trackCancelRequestBtn">Request cancellation</button>' : ''}
            <button type="button" class="ghost-btn" id="trackSupportRequestBtn">Contact support</button>
          </div>
          <div class="track-request-form" id="trackSupportForm" hidden>
            <textarea id="trackSupportMessage" maxlength="600" placeholder="Tell us what you need help with…"></textarea>
            <button type="button" class="primary-btn" id="trackSupportSend">Send support request</button>
          </div>
          <p class="track-request-status" id="trackRequestStatus" role="status"></p>
          ${Array.isArray(order.requests) && order.requests.length ? `<div class="track-request-list">${order.requests.map(r => `<div class="track-request-item"><span>${escapeHtml(r.type === 'cancel' ? 'Cancellation' : 'Support')} · ${escapeHtml(formatDateTime(r.date))}</span><strong>${escapeHtml(r.status || 'Pending')}</strong></div>`).join('')}</div>` : ''}
        </div>
        <a class="primary-btn whatsapp-btn" style="width:100%;margin-top:14px;text-decoration:none" href="https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${waText}" target="_blank" rel="noopener">📲 Ask about this order</a>
      </div>`;

    const statusEl = document.getElementById('trackRequestStatus');
    document.getElementById('trackCancelRequestBtn')?.addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      try { await submitOrderRequest(credentials, 'cancel', 'Customer requested cancellation from order tracking.', statusEl); }
      catch (err) { statusEl.textContent = err.message; e.currentTarget.disabled = false; }
    });
    document.getElementById('trackSupportRequestBtn')?.addEventListener('click', () => {
      const supportForm = document.getElementById('trackSupportForm');
      supportForm.hidden = !supportForm.hidden;
      if (!supportForm.hidden) document.getElementById('trackSupportMessage')?.focus();
    });
    document.getElementById('trackSupportSend')?.addEventListener('click', async e => {
      const message = (document.getElementById('trackSupportMessage')?.value || '').trim();
      e.currentTarget.disabled = true;
      try { await submitOrderRequest(credentials, 'support', message, statusEl); }
      catch (err) { statusEl.textContent = err.message; e.currentTarget.disabled = false; }
    });
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(event) {
    event?.preventDefault();
    const orderId = (orderField.value || '').trim();
    const phone = (phoneField.value || '').trim();
    showError('');
    if (!orderId || !phone) return showError('Please enter both your Order ID and phone number.');
    const label = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking…';
    resultEl.innerHTML = '';
    try {
      const data = await fetchTrackedOrder(orderId, phone);
      if (!data?.success) return showError("We couldn't find a matching order. Double-check the Order ID and phone number, or message us on WhatsApp.");
      renderResult(data, { orderId, phone });
    } catch (err) {
      showError(err.message === 'tracking_unavailable' ? "Order tracking isn't set up yet — message us on WhatsApp for your order status." : 'Something went wrong — please try again or message us on WhatsApp.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  }

  form?.addEventListener('submit', submit);
  const queryId = new URLSearchParams(location.search).get('orderId');
  if (queryId) {
    orderField.value = queryId.slice(0, 80);
    phoneField.focus();
  } else {
    orderField?.focus();
  }
})();
