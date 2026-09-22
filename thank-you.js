(function () {
  'use strict';
  const RECEIPT_KEY = 'dsb_last_receipt_v2';
  const LANG_KEY = 'dsb_customer_lang';
  const shell = document.getElementById('thankShell');
  const langBtn = document.getElementById('thankLangBtn');
  let lang = 'en';
  try { lang = localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en'; } catch (_) {}

  const T = {
    en: {
      eyebrow:'ORDER CONFIRMED', title:'Thank you for your order!',
      lead:'We’ve received your order. Keep your Order ID handy for tracking and support.',
      orderDetails:'Order details', orderId:'Order ID', orderTotal:'Order total', qty:'Qty', size:'Size',
      subtotal:'Subtotal', discount:'Discount', delivery:'Delivery', codFee:'Cash on Delivery fee', total:'Total',
      next:'What happens next', saved:'Order saved', savedText:'Your items, delivery details and total are safely recorded.',
      whatsapp:'WhatsApp confirmation', whatsappText:'We’ll confirm your delivery details from',
      deliveryStep:'Delivery', codText:'Pay {total} in cash when your order arrives.', upiText:'Once payment and details are confirmed, we’ll prepare your order for delivery.',
      paymentTitle:'UPI payment is not yet confirmed', paymentText:'Pay the exact order total below. The shop verifies UPI payments manually on WhatsApp. If you already paid for this order, do not pay again.',
      openUpi:'Open UPI app', reference:'Reference', track:'Track this order', download:'Download order slip', print:'Print / Save as PDF', shop:'Continue shopping',
      help:'Need help with this order?', contact:'Contact us', missingTitle:'No recent order found', missingText:'This page shows the most recent order placed on this device. If you already have an Order ID, you can still track it securely.', trackOrder:'Track an order', backShop:'Back to shop'
    },
    hi: {
      eyebrow:'ऑर्डर की पुष्टि', title:'आपके ऑर्डर के लिए धन्यवाद!',
      lead:'हमने आपका ऑर्डर प्राप्त कर लिया है। ट्रैकिंग और सहायता के लिए अपना ऑर्डर ID सुरक्षित रखें।',
      orderDetails:'ऑर्डर विवरण', orderId:'ऑर्डर ID', orderTotal:'कुल राशि', qty:'मात्रा', size:'साइज़',
      subtotal:'उप-कुल', discount:'छूट', delivery:'डिलीवरी', codFee:'कैश ऑन डिलीवरी शुल्क', total:'कुल',
      next:'अब आगे क्या होगा', saved:'ऑर्डर दर्ज हो गया', savedText:'आपके उत्पाद, डिलीवरी विवरण और कुल राशि सुरक्षित रूप से दर्ज हैं।',
      whatsapp:'व्हाट्सऐप पर पुष्टि', whatsappText:'हम आपके डिलीवरी विवरण की पुष्टि इस नंबर से करेंगे',
      deliveryStep:'डिलीवरी', codText:'ऑर्डर आने पर {total} नकद भुगतान करें।', upiText:'भुगतान और विवरण की पुष्टि के बाद हम आपका ऑर्डर डिलीवरी के लिए तैयार करेंगे।',
      paymentTitle:'UPI भुगतान अभी पुष्टि नहीं हुआ है', paymentText:'नीचे दी गई सही कुल राशि का भुगतान करें। दुकान UPI भुगतान की पुष्टि व्हाट्सऐप पर मैन्युअली करती है। यदि आप इस ऑर्डर के लिए पहले ही भुगतान कर चुके हैं, दोबारा भुगतान न करें।',
      openUpi:'UPI ऐप खोलें', reference:'रेफरेंस', track:'इस ऑर्डर को ट्रैक करें', download:'ऑर्डर स्लिप डाउनलोड करें', print:'प्रिंट / PDF सेव करें', shop:'खरीदारी जारी रखें',
      help:'इस ऑर्डर में मदद चाहिए?', contact:'संपर्क करें', missingTitle:'हाल का ऑर्डर नहीं मिला', missingText:'यह पेज इस डिवाइस पर दिए गए सबसे हाल के ऑर्डर को दिखाता है। यदि आपके पास ऑर्डर ID है, तो आप उसे सुरक्षित रूप से ट्रैक कर सकते हैं।', trackOrder:'ऑर्डर ट्रैक करें', backShop:'दुकान पर वापस जाएँ'
    }
  };

  function readReceipt() {
    try { return JSON.parse(localStorage.getItem(RECEIPT_KEY) || 'null'); } catch (_) { return null; }
  }
  function buildUpiLink(amount, orderId) {
    const params = new URLSearchParams({
      pa: CONFIG.UPI_ID,
      pn: CONFIG.UPI_PAYEE_NAME || CONFIG.SHOP_NAME,
      am: (Number(amount) || 0).toFixed(2),
      cu: 'INR',
      tn: orderId ? `Order ${orderId}` : `Order at ${CONFIG.SHOP_NAME}`,
      ...(orderId ? { tr: orderId } : {})
    });
    return `upi://pay?${params.toString()}`;
  }
  function renderQr(link) {
    const target = document.getElementById('thankQr');
    if (!target || typeof window.qrcode !== 'function') return;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(link); qr.make();
      target.innerHTML = qr.createSvgTag({ cellSize:4, margin:12, scalable:true });
      target.querySelector('svg')?.setAttribute('aria-hidden','true');
    } catch (_) { target.textContent = 'QR unavailable'; }
  }
  function feeRow(label, value, negative) {
    if (!(Number(value) > 0)) return '';
    return `<div class="thank-summary-row"><span>${escapeHtml(label)}</span><strong>${negative ? '−' : ''}${money(value)}</strong></div>`;
  }
  function renderMissing() {
    const t=T[lang];
    shell.innerHTML=`<section class="thank-missing"><div class="thank-check" aria-hidden="true">i</div><h1>${t.missingTitle}</h1><p>${t.missingText}</p><div class="thank-actions"><a class="thank-btn primary" href="track-order.html">${t.trackOrder}</a><a class="thank-btn secondary" href="index.html">${t.backShop}</a></div></section>`;
  }
  function render() {
    document.documentElement.lang = lang;
    langBtn.textContent = lang === 'hi' ? 'EN' : 'हिं';
    langBtn.setAttribute('aria-label', lang === 'hi' ? 'View in English' : 'हिंदी में देखें');
    const receipt = readReceipt();
    if (!receipt || !receipt.orderId) return renderMissing();
    const t=T[lang], isUpi=receipt.paymentMethod==='UPI' && CONFIG.UPI_ID;
    const shopPhone=formatShopPhone(CONFIG.WHATSAPP_NUMBER);
    const items=(receipt.items||[]).map(item=>`<div class="thank-item"><div><div class="thank-item-name">${escapeHtml(item.name||'Item')}</div><div class="thank-item-meta">${t.qty}: ${Number(item.qty)||0}${item.size ? ` · ${t.size}: ${escapeHtml(item.size)}`:''}</div></div><div class="thank-item-price">${money(item.lineTotal)}</div></div>`).join('');
    const upiLink=isUpi ? buildUpiLink(receipt.total,receipt.orderId):'';
    shell.innerHTML=`
      <section class="thank-hero">
        <div class="thank-check" aria-hidden="true">✓</div>
        <p class="thank-eyebrow">${t.eyebrow}</p>
        <h1>${t.title}</h1>
        <p class="thank-lead">${t.lead}</p>
      </section>
      <div class="thank-grid">
        <section class="thank-card" aria-labelledby="orderDetailsTitle">
          <div class="thank-order-head"><div><h2 id="orderDetailsTitle">${t.orderDetails}</h2><div class="thank-order-id">${t.orderId}: <strong>${escapeHtml(receipt.orderId)}</strong>${receipt.orderDate?` · ${escapeHtml(formatDateTime(receipt.orderDate))}`:''}</div></div><div class="thank-total"><span>${t.orderTotal}</span><strong>${money(receipt.total)}</strong></div></div>
          <div class="thank-items">${items || `<div class="thank-item"><div class="thank-item-name">${t.orderDetails}</div><div class="thank-item-price">${money(receipt.total)}</div></div>`}</div>
          <div class="thank-summary">
            <div class="thank-summary-row"><span>${t.subtotal}</span><strong>${money(receipt.subtotal)}</strong></div>
            ${feeRow(t.discount,receipt.discount,true)}${feeRow(t.delivery,receipt.deliveryCharge,false)}${feeRow(t.codFee,receipt.codCharge,false)}
            <div class="thank-summary-row total"><span>${t.total}</span><strong>${money(receipt.total)}</strong></div>
          </div>
        </section>
        <aside class="thank-card">
          <div class="thank-next"><h2>${t.next}</h2><ol class="thank-next-list"><li><span class="thank-step">✓</span><div><strong>${t.saved}</strong><span>${t.savedText}</span></div></li><li><span class="thank-step">2</span><div><strong>${t.whatsapp}</strong><span>${t.whatsappText}${shopPhone?` <strong>${escapeHtml(shopPhone)}</strong>`:''}.</span></div></li><li><span class="thank-step">3</span><div><strong>${t.deliveryStep}</strong><span>${isUpi?t.upiText:t.codText.replace('{total}',money(receipt.total))}</span></div></li></ol></div>
          ${isUpi?`<div class="thank-payment"><h3>${t.paymentTitle}</h3><p>${t.paymentText}</p><div class="thank-qr" id="thankQr" aria-label="UPI payment QR code"></div><a class="thank-btn primary" href="${escapeHtml(upiLink)}">${t.openUpi}</a><p class="thank-upi-ref">UPI ID: ${escapeHtml(CONFIG.UPI_ID)} · ${t.reference}: ${escapeHtml(receipt.orderId)}</p></div>`:''}
          <div class="thank-card-pad" style="padding-top:0"><div class="thank-actions"><a class="thank-btn primary" href="track-order.html?orderId=${encodeURIComponent(receipt.orderId)}">${t.track}</a><button class="thank-btn secondary" id="downloadReceiptBtn" type="button">${t.download}</button><button class="thank-btn soft" id="printReceiptBtn" type="button">${t.print}</button><a class="thank-btn secondary" href="index.html">${t.shop}</a></div><p class="thank-help">${t.help} <a href="contact.html">${t.contact}</a></p></div>
        </aside>
      </div>`;
    document.getElementById('downloadReceiptBtn')?.addEventListener('click',()=>downloadReceipt(receipt));
    document.getElementById('printReceiptBtn')?.addEventListener('click',()=>downloadReceipt(receipt,true));
    if(isUpi) renderQr(upiLink);
  }
  langBtn.addEventListener('click',()=>{lang=lang==='hi'?'en':'hi';try{localStorage.setItem(LANG_KEY,lang);}catch(_){}render();});
  render();
})();
