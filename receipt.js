/* Shared order-slip generator used after checkout. */
function downloadReceipt(receipt, print = false) {
  if (!receipt) return;
  const isUpi = receipt.paymentMethod === 'UPI';
  const paymentNote = isUpi
    ? `<div class="notice"><strong>Important:</strong> This is an order confirmation slip only. It is <strong>not a payment receipt</strong> and does not confirm that a UPI payment was received.</div>`
    : `<div class="notice"><strong>Payment:</strong> Cash on Delivery selected. Payment is due at delivery.</div>`;
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
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true });
    setTimeout(() => frame.remove(), 120000);
    return;
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `order-confirmation-${String(receipt.orderId || 'order').replace(/[^a-z0-9_-]/gi, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
