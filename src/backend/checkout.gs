/* checkout responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getCheckoutConfig_() {
  return {
    checkoutVersion: 2,
    deliveryFreeAbove: Math.max(0, safeNumber_(DELIVERY_FREE_ABOVE, 0)),
    deliveryCharge: Math.max(0, safeNumber_(DELIVERY_CHARGE, 0)),
    codCharge: Math.max(0, safeNumber_(COD_CHARGE, 0))
  };
}

function normalizeOrderAnalytics_(value) {
  const a = value && typeof value === 'object' ? value : {};
  const clean = (v, max) => sheetText_(String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 100));
  const visitor = String(a.visitorId || '').trim();
  const session = String(a.sessionId || '').trim();
  return {
    analyticssession: session ? hashText_('session:' + session).slice(0, 32) : '',
    analyticsvisitor: visitor ? hashText_('visitor:' + visitor).slice(0, 32) : '',
    analyticssource: clean(a.source, 100),
    analyticsmedium: clean(a.medium, 60),
    analyticscampaign: clean(a.campaign, 100),
    analyticscontent: clean(a.content, 100),
    analyticslanding: clean(a.landing, 160)
  };
}

function addOrder(o, customerUid) {
  const result = withWriteLock_(function () {
    const order = normalizeAndValidateOrder_(o || {});
    if (!order.ok) return order;
    if (!validRequestId_(o.requestId)) return {
      success: false,
      error: 'Please refresh the website before placing your order.',
      code: 'upgrade_required'
    };
    const fingerprint = hashText_(JSON.stringify(order));
    const journal = transactionSheet_();
    let jr = findRow_(journal, 'id', o.requestId);
    if (jr) {
      const previous = readTransaction_(journal, jr);
      if (previous.data.fingerprint !== fingerprint) return {
        success: false,
        error: 'This checkout attempt belongs to different order details.',
        code: 'request_conflict'
      };
      if (previous.status === 'Committed') return Object.assign({}, previous.data.result, {
        replayed: true
      });
    }
    const sheets = getOrderSheets_(true, !!customerUid),
      quoted = priceOrder_(order, sheets);
    if (!quoted.ok) return Object.assign({
      code: 'validation_failed'
    }, quoted);
    if (o.quoteToken ? o.quoteToken !== quoted.quote.quoteToken : !sameCheckoutQuote_(o.expectedQuote, quoted.quote)) return {
      success: false,
      code: 'quote_changed',
      error: 'Prices or charges changed. Please review the updated total.',
      quote: quoted.quote
    };
    rateLimit_('order-phone:' + hashText_(canonicalPhone_(order.phone)), 5, 3600);
    rateLimit_('orders-global', 120, 3600);
    const id = 'ORD-' + hashText_(o.requestId).slice(0, 16).toUpperCase(),
      now = new Date();
    const q = quoted.quote;
    const analytics = normalizeOrderAnalytics_(o.analyticsContext);
    const record = {
      orderid: id,
      date: now,
      customeruid: customerUid || '',
      customeritems: customerUid ? JSON.stringify(quoted.priced.items.map(x => ({name:x.name,size:x.size||'',qty:x.qty,unitPrice:x.unitPrice,lineTotal:x.lineTotal}))) : '',
      customername: order.customerName,
      phone: order.phone,
      address: order.address,
      paymentmethod: order.paymentMethod,
      promocode: order.promoCode,
      discount: q.discount,
      deliverycharge: q.deliveryCharge,
      codcharge: q.codCharge,
      items: quoted.priced.summary,
      total: q.correctedTotal,
      status: 'Pending',
      analyticssession: analytics.analyticssession, analyticsvisitor: analytics.analyticsvisitor,
      analyticssource: analytics.analyticssource, analyticsmedium: analytics.analyticsmedium,
      analyticscampaign: analytics.analyticscampaign, analyticscontent: analytics.analyticscontent,
      analyticslanding: analytics.analyticslanding
    };
    const result = Object.assign({}, q, {
      success: true,
      orderId: id,
      orderDate: now,
      paymentMethod: order.paymentMethod,
      promoCode: order.promoCode
    });
    delete result.quoteToken;
    const data = {
      kind: 'order',
      notifyAsync: true,
      orderId: id,
      fingerprint: fingerprint,
      phoneHash: hashText_(canonicalPhone_(order.phone)),
      record: record,
      result: result,
      items: quoted.priced.items,
      stock: stockPlan_(quoted.priced.items, sheets),
      promo: promoPlan_(order.promoCode, order.phone)
    };
    jr = saveTransaction_(journal, jr, o.requestId, 'Pending', data);
    // Durable preparation is flushed BEFORE stock is touched.
    SpreadsheetApp.flush();
    try {
      applyStockPlan_(data.stock, true, sheets);
      sheets.orders.appendRow(orderSheetRow_(sheets.orderHeads, record));
      SpreadsheetApp.flush();
      finishTransaction_(journal, jr, data, true, true);
    } catch (err) {
      // A failed response/write can be ambiguous: the order row is the commit marker.
      const committed = !!findRow_(sheets.orders, 'orderid', id);
      try {
        finishTransaction_(journal, jr, data, committed);
      } catch (recoveryError) {
        console.error('Transaction recovery pending: ' + id);
      }
      if (!committed) return {
        success: false,
        error: 'The order could not be completed. Use Retry to safely check again.',
        code: 'retry_same_request'
      };
    }
    return result;
  });
  return result;
}
function normalizeAndValidateOrder_(o) {
  const customerName = String(o.customerName || o.customername || '').trim();
  const phone = cleanPhone_(o.phone),
    address = String(o.address || '').trim().replace(/\nPIN: [^\n]*$/, '').trim();
  const pinCode = String(o.pinCode || '').trim();
  const paymentMethod = String(o.paymentMethod || o.paymentmethod || 'Cash on Delivery');
  const promoCode = String(o.promoCode || o.promocode || '').trim().toUpperCase();
  if (o.website) return {
    success: false,
    code: 'validation_failed',
    error: 'Could not accept this request.'
  };
  if (customerName.length < 2 || customerName.length > 100) return {
    success: false,
    code: 'validation_failed',
    error: 'Please provide a valid customer name.'
  };
  if (!/^\d{10,15}$/.test(phone) || /^0+$/.test(phone)) return {
    success: false,
    code: 'validation_failed',
    error: 'Please provide a valid phone number.'
  };
  if (address.length < 5 || address.length > 500) return {
    success: false,
    code: 'validation_failed',
    error: 'Please provide a valid delivery address.'
  };
  if (!/^[1-9][0-9]{5}$/.test(pinCode)) return {
    success: false, code: 'validation_failed',
    error: 'Please provide a valid 6-digit PIN code.'
  };
  if (address.length + 12 > 500) return {
    success: false, code: 'validation_failed',
    error: 'Please shorten the delivery address to 488 characters.'
  };
  if (ALLOWED_PAYMENT_METHODS.indexOf(paymentMethod) < 0 || promoCode.length > 30) return {
    success: false,
    code: 'validation_failed',
    error: 'Invalid payment method or promo code.'
  };
  if (!Array.isArray(o.itemsDetail) || !o.itemsDetail.length || o.itemsDetail.length > 50) return {
    success: false,
    code: 'validation_failed',
    error: 'Cart is empty or too large.'
  };
  const seen = Object.create(null),
    itemsDetail = [];
  for (const x of o.itemsDetail) {
    const id = String(x && x.id || '').trim(),
      qty = Number(x && x.qty);
    const size = String(x && x.size || '').trim(),
      variantKey = JSON.stringify([id, size]);
    if (!id || id.length > 80 || size.length > 40 || !Number.isInteger(qty) || qty < 1 || qty > 999 || seen[variantKey]) return {
      success: false,
      code: 'validation_failed',
      error: 'Invalid or duplicate cart item.'
    };
    seen[variantKey] = true;
    itemsDetail.push({
      id: id,
      qty: qty,
      ...(size ? {
        size: size
      } : {})
    });
  }
  itemsDetail.sort((a, b) => a.id.localeCompare(b.id) || String(a.size || '').localeCompare(String(b.size || '')));
  return {
    ok: true,
    customerName: customerName,
    phone: phone,
    address: address + '\nPIN: ' + pinCode,
    paymentMethod: paymentMethod,
    promoCode: promoCode,
    itemsDetail: itemsDetail
  };
}
function getOrderSheets_(ensureAnalytics, ensureCustomer) {
  const productSheet = getSheet_(PRODUCTS_SHEET);
  const productData = productSheet.getDataRange().getValues();
  const productHeads = productData[0].map(h => String(h).trim().toLowerCase());
  const orders = getSheet_(ORDERS_SHEET);
  if (ensureCustomer) ['customerUID','customerItems'].forEach(name => ensureColumn_(orders, name));
  if (ensureAnalytics) ['analyticsSession','analyticsVisitor','analyticsSource','analyticsMedium','analyticsCampaign','analyticsContent','analyticsLanding'].forEach(name => ensureColumn_(orders, name));
  const orderHeads = headers_(orders);
  if (['orderid', 'date', 'customername', 'phone', 'address', 'paymentmethod', 'promocode', 'discount', 'items', 'total', 'status'].some(h => orderHeads.indexOf(h) < 0)) throw new Error('Orders sheet is missing required columns. Ask the shop to check setup.');
  return {
    productSheet: productSheet,
    productHeads: productHeads,
    productData: productData,
    orders: orders,
    orderHeads: orderHeads
  };
}
function buildValidatedOrderItems_(itemsDetail, productData) {
  const heads = productData[0].map(h => String(h).trim().toLowerCase());
  const idCol = heads.indexOf('id');
  const nameCol = heads.indexOf('name');
  const catCol = heads.indexOf('category');
  const subCol = heads.indexOf('subcategory');
  const priceCol = heads.indexOf('price');
  const costCol = heads.indexOf('costprice');
  const qtyCol = heads.indexOf('stockqty');
  const stockCol = heads.indexOf('stock');
  if (idCol === -1 || priceCol === -1) return {
    ok: false,
    error: 'Products sheet is missing id/price columns.'
  };
  const byId = Object.create(null);
  for (let i = 1; i < productData.length; i++) {
    const pid = String(productData[i][idCol] || '').trim();
    if (pid) byId[pid] = {
      rowIndex: i,
      row: productData[i]
    };
  }
  const items = [];
  const requestedTotals = Object.create(null), requestedSizes = Object.create(null);
  itemsDetail.forEach(x => {
    requestedTotals[x.id] = (requestedTotals[x.id] || 0) + x.qty;
    const sizeKey=JSON.stringify([x.id,x.size||'']);requestedSizes[sizeKey]=(requestedSizes[sizeKey]||0)+x.qty;
  });
  let subtotal = 0;
  for (const requested of itemsDetail) {
    const found = byId[requested.id];
    if (!found) return {
      ok: false,
      error: `Product ${requested.id} is no longer available.`
    };
    const row = found.row;
    if (heads.indexOf('archived') >= 0 && String(row[heads.indexOf('archived')]).toLowerCase() === 'yes') return {
      ok: false,
      error: 'This product is no longer available.'
    };
    const sizes = parseSizes_(heads.indexOf('sizes') < 0 ? '' : row[heads.indexOf('sizes')]);
    const size = String(requested.size || '');
    if (sizes.length ? !sizes.includes(size) : !!size) return {
      ok: false,
      code: 'invalid_size',
      error: 'Please choose an available size for ' + (row[nameCol] || requested.id) + '.'
    };
    const sizeStockRaw=heads.indexOf('sizestock')<0?'':row[heads.indexOf('sizestock')];
    let sizeStock;try{sizeStock=parseSizeStock_(sizeStockRaw,sizes);}catch(_){return {ok:false,error:'Size inventory needs correction. Contact the shop.'};}
    if(sizeStock && requestedSizes[JSON.stringify([requested.id,size])] > sizeStock[size])return {ok:false,code:'insufficient_stock',productId:requested.id,size:size,availableQty:sizeStock[size],error:'Only '+sizeStock[size]+' left in size '+size+'.'};
    const status = String(stockCol === -1 ? 'in stock' : row[stockCol] || 'in stock').trim().toLowerCase();
    if (status === 'out of stock') return {
      ok: false,
      error: `${row[nameCol] || requested.id} is out of stock.`
    };
    const overrides = Object.create(null);
    if (heads.indexOf('sizeprices') >= 0) String(row[heads.indexOf('sizeprices')] || '').split(',').forEach(e => {
      const a = e.split('='),
        price = Number(a[1]);
      if (a.length === 2 && sizes.includes(a[0].trim()) && Number.isFinite(price) && price > 0 && price <= 10000000) overrides[a[0].trim()] = price;
    });
    const unitPrice = roundMoney_(overrides[size] || Number(row[priceCol]));
    if (String(row[priceCol]).trim() === '' || !Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 10000000) return {
      ok: false,
      error: 'Invalid product price.'
    };
    let tracked = false;
    let availableQty = null;
    if (qtyCol !== -1 && row[qtyCol] !== '' && row[qtyCol] !== null && row[qtyCol] !== undefined) {
      tracked = true;
      availableQty = Number(row[qtyCol]);
      if (!Number.isInteger(availableQty) || availableQty < 0) return {
        ok: false,
        error: 'Invalid inventory quantity. Please contact the shop.'
      };
      if (requestedTotals[requested.id] > availableQty) {
        return {
          ok: false,
          error: `Only ${availableQty} left for ${row[nameCol] || requested.id}.`,
          code: 'insufficient_stock',
          productId: requested.id,
          availableQty: availableQty
        };
      }
    }
    const lineTotal = roundMoney_(unitPrice * requested.qty);
    subtotal += lineTotal;
    items.push({
      id: requested.id,
      name: String(nameCol === -1 ? requested.id : row[nameCol] || requested.id),
      category: catCol === -1 ? '' : row[catCol],
      subcategory: subCol === -1 ? '' : row[subCol],
      qty: requested.qty,
      ...(size ? {
        size: size
      } : {}),
      unitPrice,
      costPrice: costCol === -1 ? 0 : safeNumber_(row[costCol], 0),
      costKnown: costCol !== -1 && knownCost_(row[costCol]),
      lineTotal,
      tracked,
      availableQty,
      sizeStockRaw: sizeStock ? String(sizeStockRaw) : '',
      rowIndex: found.rowIndex
    });
  }
  return {
    ok: true,
    items,
    subtotal,
    summary: items.map(x => `${x.id} ${x.name}${x.size ? ' (Size: ' + x.size + ')' : ''} x${x.qty} @ ₹${x.unitPrice.toFixed(2)} = ₹${x.lineTotal.toFixed(2)}`).join(' | ')
  };
}
function quoteOrder(o) {
  return withWriteLock_(function () {
    const order = normalizeAndValidateOrder_(o || {});
    if (!order.ok) return order;
    rateLimit_('quotes:' + hashText_(canonicalPhone_(order.phone)), 30, 600);
    const priced = priceOrder_(order, getOrderSheets_());
    return priced.ok ? Object.assign({
      success: true
    }, priced.quote) : priced;
  });
}
function priceOrder_(order, sheets) {
  const priced = buildValidatedOrderItems_(order.itemsDetail, sheets.productData);
  if (!priced.ok) return Object.assign({
    success: false
  }, priced);
  let discount = 0;
  if (order.promoCode) {
    const promo = validatePromoFast_(order.promoCode, order.phone);
    if (!promo.ok) return {
      success: false,
      ok: false,
      code: 'invalid_promo',
      error: 'This promo is no longer available. Remove it or choose another code before ordering.'
    };
    discount = roundMoney_(Math.min(priced.subtotal, Math.max(0, promo.discountFor(priced.subtotal))));
  }
  const cfg = getCheckoutConfig_(),
    merchandiseTotal = roundMoney_(priced.subtotal - discount);
  const deliveryCharge = merchandiseTotal < cfg.deliveryFreeAbove ? cfg.deliveryCharge : 0;
  const codCharge = order.paymentMethod === 'Cash on Delivery' ? cfg.codCharge : 0;
  const quote = {
    subtotal: roundMoney_(priced.subtotal),
    discount: discount,
    merchandiseTotal: merchandiseTotal,
    deliveryCharge: deliveryCharge,
    codCharge: codCharge,
    correctedTotal: roundMoney_(merchandiseTotal + deliveryCharge + codCharge),
    items: priced.items.map(x => ({
      id: x.id,
      name: x.name,
      qty: x.qty,
      ...(x.size ? {
        size: x.size
      } : {}),
      unitPrice: x.unitPrice,
      lineTotal: x.lineTotal
    }))
  };
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('CHECKOUT_SIGNING_KEY');
  if (!key) {
    key = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('CHECKOUT_SIGNING_KEY', key);
  }
  quote.quoteToken = hashText_(key + JSON.stringify(order) + JSON.stringify(quote));
  return {
    ok: true,
    quote: quote,
    priced: priced
  };
}
function orderResult(requestId, phone) {
  return withWriteLock_(function () {
    if (!validRequestId_(requestId)) return {
      success: false,
      code: 'not_found',
      error: 'Order attempt not found.'
    };
    rateLimit_('lookup:' + requestId, 30, 600);
    const sheet = transactionSheet_(),
      row = findRow_(sheet, 'id', requestId);
    if (!row) return {
      success: false,
      code: 'not_found',
      error: 'No order was saved for this attempt.'
    };
    const t = readTransaction_(sheet, row);
    if (!phoneIdentityVariants_(phone).some(identity => t.data.phoneHash === hashText_(identity))) return {
      success: false,
      code: 'not_found',
      error: 'Order attempt not found.'
    };
    if (t.status === 'Committed') return Object.assign({}, t.data.result, {
      replayed: true
    });
    return {
      success: false,
      code: 'not_found',
      error: 'No order was saved for this attempt.'
    };
  });
}
function sameCheckoutQuote_(expected, actual) {
  if (!expected || !Array.isArray(expected.items)) return false;
  const amounts = ['subtotal', 'discount', 'deliveryCharge', 'codCharge', 'correctedTotal'];
  if (amounts.some(k => typeof expected[k] !== 'number' || !Number.isFinite(expected[k]) || expected[k] !== actual[k])) return false;
  const normalize = items => items.map(x => ({
    id: String(x.id),
    size: String(x.size || ''),
    qty: x.qty,
    unitPrice: x.unitPrice,
    lineTotal: x.lineTotal
  })).sort((a, b) => a.id.localeCompare(b.id) || a.size.localeCompare(b.size));
  return JSON.stringify(normalize(expected.items)) === JSON.stringify(normalize(actual.items));
}
