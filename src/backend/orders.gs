/* orders responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getAllOrders(options) {
  const all = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  if (!options) return all;
  const q = String(options.query || '').trim().toLowerCase().slice(0, 100),
    status = String(options.status || 'all');
  const list = all.filter(o => (!options.payment || options.payment === 'all' || (o.paymentstatus || 'Unverified') === options.payment) && (status === 'all' || (o.status || 'Pending') === status) && (!q || `${o.customername} ${o.phone} ${o.orderid}`.toLowerCase().includes(q)));
  list.sort((a, b) => options.sort === 'name-asc' ? String(a.customername || '').localeCompare(String(b.customername || '')) : (options.sort === 'date-asc' ? 1 : -1) * (new Date(a.date) - new Date(b.date)));
  const pageSize = 40,
    page = Math.max(0, Math.min(Math.floor(Number(options.page) || 0), Math.max(0, Math.ceil(list.length / pageSize) - 1)));
  const pageOrders = list.slice(page * pageSize, (page + 1) * pageSize);
  const requests = orderRequestsByOrderIds_(pageOrders.map(o => o.orderid));
  pageOrders.forEach(o => { o.requests = requests[String(o.orderid || '')] || []; });
  return {
    orders: pageOrders,
    page,
    pageSize,
    total: list.length,
    allCount: all.length
  };
}
function getDashboardData() {
  // Dashboard data is deliberately read fresh from Sheets. Admins sometimes
  // edit/delete order rows directly in Google Sheets, which cannot invalidate
  // Apps Script CacheService and could otherwise leave stale profit visible.

  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const monthKey = Utilities.formatDate(now, tz, 'yyyy-MM');
  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  const statusCounts = {};
  const cancelledIds = {};
  const existingOrderIds = {};
  const completedOrders = {};
  let todayRevenue = 0,
    todayOrders = 0,
    monthRevenue = 0,
    monthOrders = 0;
  orders.forEach(order => {
    const orderId = String(order.orderid || '').trim();
    if (orderId) existingOrderIds[orderId] = true;
    const status = String(order.status || 'Pending').trim() || 'Pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'Cancelled') cancelledIds[String(order.orderid || '')] = true;
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || COMPLETED_STATUSES.indexOf(status) < 0) return;
    completedOrders[orderId] = order;
    const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const orderMonth = Utilities.formatDate(date, tz, 'yyyy-MM');
    const total = Math.max(0, safeNumber_(order.total, 0));
    if (dateKey === todayKey) {
      todayRevenue += total;
      todayOrders += 1;
    }
    if (orderMonth === monthKey) {
      monthRevenue += total;
      monthOrders += 1;
    }
  });
  const products = rowsAsObjects_(getSheet_(PRODUCTS_SHEET));
  const lowStock = products.filter(p => p.stockqty !== '' && p.stockqty !== null && p.stockqty !== undefined && safeNumber_(p.stockqty, -1) >= 0 && safeNumber_(p.stockqty, -1) <= 5).map(p => ({
    id: p.id,
    name: p.name || p.id,
    qty: Math.max(0, Math.floor(safeNumber_(p.stockqty, 0)))
  })).sort((a, b) => a.qty - b.qty || String(a.name).localeCompare(String(b.name)));
  let monthProfit = 0;
  const productStats = {};
  const accounted = {};
  try {
    const items = rowsAsObjects_(getSheet_(ORDER_ITEMS_SHEET));
    items.forEach(item => {
      const orderId = String(item.orderid || '').trim();
      // OrderItems is accounting history, but an orphaned line must not count
      // after its parent order has been deleted manually from the Orders tab.
      if (!orderId || !completedOrders[orderId]) return;
      const date = new Date(item.date);
      if (isNaN(date.getTime()) || Utilities.formatDate(date, tz, 'yyyy-MM') !== monthKey) return;
      const qty = Math.max(0, safeNumber_(item.qty, 0));
      const revenue = Math.max(0, safeNumber_(item.linerevenue, safeNumber_(item.unitprice, 0) * qty));
      const cost = Math.max(0, safeNumber_(item.linecost, safeNumber_(item.costprice, 0) * qty));
      monthProfit += revenue - cost;
      accounted[orderId] = true;
      const key = String(item.productid || item.productname || 'Unknown');
      if (!productStats[key]) productStats[key] = {
        name: item.productname || key,
        qty: 0,
        revenue: 0
      };
      productStats[key].qty += qty;
      productStats[key].revenue += revenue;
    });
  } catch (err) {
    // OrderItems is optional; the rest of the dashboard still works.
  }
  Object.keys(accounted).forEach(id => {
    monthProfit -= Math.max(0, safeNumber_(completedOrders[id].discount, 0));
  });
  monthProfit = roundMoney_(monthProfit);
  const accountingIncomplete = Object.keys(completedOrders).some(id => {
    const d = new Date(completedOrders[id].date);
    return Utilities.formatDate(d, tz, 'yyyy-MM') === monthKey && !accounted[id];
  });
  const topProducts = Object.keys(productStats).map(k => productStats[k]).sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 5);
  const recentOrders = orders.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const sevenDaySales = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86400000);
    sevenDaySales.push({
      key: Utilities.formatDate(day, tz, 'yyyy-MM-dd'),
      label: Utilities.formatDate(day, tz, 'EEE'),
      total: 0
    });
  }
  orders.forEach(o => {
    if (COMPLETED_STATUSES.indexOf(o.status) < 0) return;
    const d = new Date(o.date);
    if (isNaN(d.getTime())) return;
    const slot = sevenDaySales.find(x => x.key === Utilities.formatDate(d, tz, 'yyyy-MM-dd'));
    if (slot) slot.total += Math.max(0, safeNumber_(o.total, 0));
  });
  const telegram = getTelegramHealth_();
  const dashboard = {
    todayRevenue,
    todayOrders,
    monthRevenue,
    monthOrders,
    monthProfit,
    accountingIncomplete,
    statusCounts,
    lowStock,
    topProducts,
    recentOrders,
    sevenDaySales,
    telegram
  };
  return dashboard;
}
function updateOrderStatus(orderId, statusValue) {
  return withWriteLock_(function () {
    const id = String(orderId || '').trim(),
      status = String(statusValue || '').trim();
    if (!id || ALLOWED_ORDER_STATUSES.indexOf(status) < 0) throw new Error('Invalid order or status.');
    const sheet = getSheet_(ORDERS_SHEET),
      heads = headers_(sheet),
      row = findRow_(sheet, 'orderid', id),
      col = heads.indexOf('status') + 1;
    if (!row || col < 1) throw new Error('Order not found or status column missing.');
    const oldStatus = String(sheet.getRange(row, col).getValue() || 'Pending');
    const allowedNext = ORDER_STATUS_TRANSITIONS[oldStatus] || [];
    if (oldStatus !== status && allowedNext.indexOf(status) < 0) throw new Error('Invalid status transition from ' + oldStatus + ' to ' + status + '.');
    if (oldStatus === status) return {
      success: true,
      orderId: id,
      status: status
    };
    const stock = statusStockPlan_(id, oldStatus, status);
    const journal = transactionSheet_(),
      data = {
        kind: 'status',
        orderId: id,
        oldStatus: oldStatus,
        newStatus: status,
        stock: stock
      };
    const jr = saveTransaction_(journal, 0, 'STATUS-' + Utilities.getUuid(), 'Pending', data);
    SpreadsheetApp.flush();
    try {
      applyStockPlan_(stock, true);
      sheet.getRange(row, col).setValue(status);
      SpreadsheetApp.flush();
      finishTransaction_(journal, jr, data, true);
    } catch (err) {
      const committed = String(sheet.getRange(row, col).getValue()) === status;
      finishTransaction_(journal, jr, data, committed);
      if (!committed) throw new Error('Status was not changed. Please retry.');
    }
    return {
      success: true,
      orderId: id,
      status: status
    };
  });
}
function getOrderItemQuantities_(orderId) {
  const wantedId = String(orderId || '').trim();
  const totals = {};

  // Preferred source: permanent OrderItems snapshots. These retain exact
  // product IDs + quantities even if the product name/price changes later.
  try {
    const rows = rowsAsObjects_(getSheet_(ORDER_ITEMS_SHEET));
    rows.forEach(item => {
      if (String(item.orderid || '').trim() !== wantedId) return;
      const id = String(item.productid || '').trim();
      const qty = Math.max(0, Math.floor(safeNumber_(item.qty, 0)));
      if (id && qty) totals[id] = (totals[id] || 0) + qty;
    });
  } catch (err) {
    // OrderItems is optional; fall through to the order-row summary below.
  }
  const fromItems = Object.keys(totals).map(id => ({
    id: id,
    qty: totals[id]
  }));
  if (fromItems.length) return fromItems;

  // Compatibility fallback for older installations/orders where OrderItems
  // did not exist or failed to record. New orders store their summary as:
  //   PRODUCT_ID Product name xQTY | PRODUCT_ID Product name xQTY
  // Only use this fallback when there are no OrderItems rows, preventing any
  // possibility of counting the same quantity twice.
  try {
    const sheet = getSheet_(ORDERS_SHEET);
    if (sheet.getLastRow() < 2) return [];
    const heads = headers_(sheet);
    const idCol = heads.indexOf('orderid');
    const itemsCol = heads.indexOf('items');
    if (idCol === -1 || itemsCol === -1) return [];
    const hit = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).createTextFinder(wantedId).matchEntireCell(true).findNext();
    if (!hit) return [];
    const summary = String(sheet.getRange(hit.getRow(), itemsCol + 1).getValue() || '');
    const fallbackTotals = {};
    summary.split('|').forEach(part => {
      const text = String(part || '').trim();
      // Product IDs generated/used by this site contain no whitespace. Match
      // the first token as ID and the final "xN" as quantity; product names
      // may contain arbitrary spaces in between.
      const match = /^(\S+)\s+.+\s+x(\d+)$/i.exec(text);
      if (!match) return;
      const id = String(match[1] || '').trim();
      const qty = Math.max(0, Math.floor(safeNumber_(match[2], 0)));
      if (id && qty) fallbackTotals[id] = (fallbackTotals[id] || 0) + qty;
    });
    return Object.keys(fallbackTotals).map(id => ({
      id: id,
      qty: fallbackTotals[id]
    }));
  } catch (err) {
    return [];
  }
}
function recordOrderItemsFromValidated_(orderId, date, items) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ORDER_ITEMS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDER_ITEMS_SHEET);
    sheet.appendRow(['orderId', 'date', 'productId', 'productName', 'category', 'subcategory', 'qty', 'unitPrice', 'costPrice', 'lineRevenue', 'lineCost', 'lineProfit']);
  }
  if (items.some(x => x.size)) ensureColumn_(sheet, 'size');
  const heads = headers_(sheet),
    idColumn = heads.indexOf('orderid');
  if (idColumn < 0) throw new Error('OrderItems is missing orderId.');
  const hits = sheet.getLastRow() > 1 ? sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(orderId)).matchEntireCell(true).findAll() : [];
  const existing = hits.map(hit => {
    const values = sheet.getRange(hit.getRow(), 1, 1, heads.length).getValues()[0];
    const item = {};
    heads.forEach((h, i) => item[h] = values[i]);
    return item;
  });
  const rows = items.filter(item => !existing.some(r => String(r.productid) === item.id && String(r.size || '') === String(item.size || ''))).map(item => {
    const record = {
      orderid: orderId,
      date: new Date(date),
      productid: item.id,
      productname: item.name,
      size: item.size || '',
      category: item.category,
      subcategory: item.subcategory,
      qty: item.qty,
      unitprice: item.unitPrice,
      costprice: item.costPrice,
      linerevenue: item.lineTotal,
      linecost: roundMoney_(item.qty * item.costPrice),
      lineprofit: roundMoney_(item.lineTotal - item.qty * item.costPrice)
    };
    return heads.map(h => sheetText_(record[h] !== undefined ? record[h] : ''));
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, heads.length).setValues(rows);
}
function trackOrder(orderId, phone) {
  if (!orderId || !phone) return { success: false, error: 'missing orderId or phone' };
  rateLimit_('tracking:' + hashText_(String(orderId)), 30, 600);
  const order = findCustomerOrder_(orderId, phone);
  if (!order) return { success: false, error: 'not_found' };
  const status = String(order.status || 'Pending');
  return {
    success: true,
    orderId: order.orderid,
    date: order.date,
    status: status,
    items: order.items,
    total: order.total,
    discount: order.discount,
    deliveryCharge: order.deliverycharge || 0,
    codCharge: order.codcharge || 0,
    paymentMethod: order.paymentmethod,
    canRequestCancellation: canCustomerRequestCancellation_(status),
    requests: publicOrderRequests_(order.orderid)
  };
}
function verifyPayment_(body, actor) {
  return withWriteLock_(function () {
    const state = String(body.paymentStatus || ''),
      reference = String(body.reference || '').trim();
    if (!['Unverified', 'Received', 'Refunded'].includes(state) || reference.length > 120) throw new Error('Invalid payment details.');
    if (state !== 'Unverified' && !reference) throw new Error('Enter a transaction reference or verification note.');
    const sheet = getSheet_(ORDERS_SHEET);
    ['paymentstatus', 'paymentreference', 'paymentverifiedby', 'paymentverifiedat'].forEach(k => ensureColumn_(sheet, k));
    const heads = headers_(sheet),
      row = findRow_(sheet, 'orderid', String(body.orderId || ''));
    if (!row) throw new Error('Order not found.');
    const current = sheet.getRange(row, heads.indexOf('paymentverifiedat') + 1).getValue();
    if ((current instanceof Date ? current.toISOString() : String(current || '')) !== String(body.expectedVerifiedAt || '')) throw new Error('Payment details changed. Refresh orders before verifying.');
    const record = {
      paymentstatus: state,
      paymentreference: reference,
      paymentverifiedby: actor.name,
      paymentverifiedat: new Date().toISOString()
    };
    Object.keys(record).forEach(k => sheet.getRange(row, heads.indexOf(k) + 1).setValue(sheetText_(record[k])));
    return {
      success: true
    };
  });
}
