/**
 * Dhatterwal Suhag Bhandar — Google Sheet backend
 * ------------------------------------------------
 * Paste this into Extensions > Apps Script on your product Google Sheet,
 * then deploy as a Web App. See SETUP-GUIDE.md for step-by-step instructions.
 *
 * Sheet tabs expected in this spreadsheet:
 *
 * "Products" — id | name | nameHindi | category | subcategory | price | mrp | costPrice | image | images | description | stock | stockQty | tags
 * "Reviews"  — id | productId | name | rating | comment | date
 * "Orders"   — orderId | date | customerName | phone | address | paymentMethod | promoCode | discount | items | total | status
 * "Promos"   — code | type | value | active | maxUses | onePerCustomer | uses
 * "PromoCustomers" — created automatically when a one-per-customer promo is used;
 *                    stores only code+phone hashes and is hidden by the script.
 * "OrderItems" — orderId | date | productId | productName | category | subcategory | qty | unitPrice | costPrice | lineRevenue | lineCost | lineProfit
 *
 * stockQty is optional — leave it blank on a product to skip quantity
 * tracking for that item entirely (it'll behave exactly as before, using
 * only the plain "stock" in-stock/out-of-stock text).
 *
 * nameHindi is optional — shown alongside the English name if filled in.
 * images is optional — extra photo URLs, comma-separated, shown as a
 * gallery on the product page. "image" is still the main/thumbnail photo.
 *
 * costPrice is optional and NEVER sent to the public storefront — only
 * included in the Products response when the request includes a valid
 * admin key. Used for the admin dashboard's profit figures.
 *
 * On Promos: maxUses is optional (blank = unlimited total redemptions). The backend
 * maintains a lightweight `uses` counter automatically; do not edit it manually.
 * onePerCustomer is "yes"/"no" — "yes" means each phone number can use that
 * code once, ever. Both are enforced here on the server when an order comes
 * in, never trusted from the browser.
 *
 * OrderItems is written automatically, one row per product per order, at
 * the moment an order is placed — it's a permanent record of that item's
 * price and cost AT THAT TIME (not looked up again later), so later price
 * changes never rewrite history. This tab is optional: if it doesn't exist,
 * orders still save fine, just without line-item / profit tracking.
 */

const PRODUCTS_SHEET = 'Products';
const REVIEWS_SHEET = 'Reviews';
const ORDERS_SHEET = 'Orders';
const PROMOS_SHEET = 'Promos';
const ORDER_ITEMS_SHEET = 'OrderItems';
const PROMO_CUSTOMERS_SHEET = 'PromoCustomers';
const CATALOG_CACHE_KEY = 'dsb.catalog.v2';
const CATALOG_CACHE_TTL = 120; // seconds
const REVIEW_SUMMARY_CACHE_KEY = 'dsb.reviewSummary.v1';
const REVIEW_SUMMARY_CACHE_TTL = 180; // seconds
const REVIEWS_CACHE_KEY = 'dsb.reviews.v1';
const REVIEWS_CACHE_TTL = 120; // seconds
const PROMOS_CACHE_KEY = 'dsb.promos.v1';
const PROMOS_CACHE_TTL = 60; // seconds
const DASHBOARD_CACHE_KEY = 'dsb.adminDashboard.v1';
const DASHBOARD_CACHE_TTL = 20; // seconds
const ALLOWED_PAYMENT_METHODS = ['Cash on Delivery', 'UPI'];
const ALLOWED_ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Fulfilled'];

// CHANGE THIS before deploying — it's the password the admin page uses to
// add/delete products and manage orders. Anyone who has this key can edit
// your sheet and see customer order details.
const ADMIN_KEY = 'change-this-secret-key';

// Optional — silently pings a Telegram chat/channel the instant a new order
// comes in, so you don't have to keep the Sheet or admin page open to know.
// Leave TELEGRAM_BOT_TOKEN blank to turn this off entirely; nothing else
// about order-taking changes either way. See SETUP-GUIDE.md for how to get
// a bot token and chat ID from @BotFather in about two minutes.
const TELEGRAM_BOT_TOKEN = ''; // e.g. '123456789:AAExampleTokenFromBotFather'
const TELEGRAM_CHAT_ID = '';   // your numeric chat ID, or '@yourchannel'

function doGet(e) {
  const action = (e.parameter.action || 'products').toString();
  if (action === 'products') {
    // Public product data only. Admin product reads use POST so the admin key
    // never rides in a GET URL.
    return jsonResponse(getAllProducts(false));
  }
  if (action === 'reviews') {
    if (e.parameter.summary === '1') return jsonResponse(getReviewSummaries());
    return jsonResponse(getReviews(e.parameter.productId));
  }
  if (action === 'promos') {
    return jsonResponse(getActivePromos());
  }
  if (action === 'orders') {
    return jsonResponse({ error: 'admin reads require POST' });
  }
  if (action === 'trackOrder') {
    return jsonResponse(trackOrder(e.parameter.orderId, e.parameter.phone));
  }
  if (action === 'dashboard') {
    return jsonResponse({ error: 'admin reads require POST' });
  }
  return jsonResponse({ error: 'unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Public actions — no admin key needed, customers use these from the site.
    if (body.action === 'addReview') {
      return jsonResponse(addReview(body.review || {}));
    }
    if (body.action === 'addOrder') {
      return jsonResponse(addOrder(body.order || {}));
    }

    // Everything below is an admin-only action.
    if (body.key !== ADMIN_KEY) {
      return jsonResponse({ error: 'unauthorized' });
    }
    if (body.action === 'add') {
      return jsonResponse(addProduct(body.product || {}));
    }
    if (body.action === 'update') {
      return jsonResponse(updateProduct(body.product || {}));
    }
    if (body.action === 'adminProducts') {
      return jsonResponse(getAllProducts(true));
    }
    if (body.action === 'adminOrders') {
      return jsonResponse(getAllOrders());
    }
    if (body.action === 'adminDashboard') {
      return jsonResponse(getDashboardData());
    }
    if (body.action === 'delete') {
      return jsonResponse(deleteProduct(body.id));
    }
    if (body.action === 'updateOrderStatus') {
      return jsonResponse(updateOrderStatus(body.orderId, body.status));
    }
    return jsonResponse({ error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

/* ---------------- shared helpers ---------------- */

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet named "' + name + '" not found');
  return sheet;
}

function headers_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
}

function rowsAsObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const heads = data[0].map(h => String(h).trim().toLowerCase());
  return data.slice(1)
    .filter(row => String(row[0]).trim() !== '')
    .map(row => {
      const obj = {};
      heads.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

// Picks the next ID by looking at the highest number actually in use for
// this prefix — not the row count. Row count breaks the moment any product
// is ever deleted (the count drops, but existing IDs elsewhere don't
// change), which is exactly how two products can end up with the same ID.
function nextId_(sheet, prefix) {
  const heads = headers_(sheet);
  const idCol = heads.indexOf('id') !== -1 ? heads.indexOf('id') : heads.indexOf('orderid');
  const data = sheet.getDataRange().getValues();
  const pattern = new RegExp('^' + prefix + '-(\\d+)$');
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const match = pattern.exec(String(data[i][idCol] || ''));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return prefix + '-' + String(maxNum + 1).padStart(4, '0');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Cache helpers ---------------- */

function cacheGetJson_(key) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function cachePutJson_(key, value, ttl) {
  cacheRemove_(key);
  const raw = JSON.stringify(value);
  // CacheService has a per-entry size limit. Product catalogs are normally
  // small, but chunking makes this safe for larger shops too.
  const MAX = 90000;
  if (raw.length <= MAX) {
    CacheService.getScriptCache().put(key, raw, ttl);
    return;
  }
  const count = Math.ceil(raw.length / MAX);
  const cache = CacheService.getScriptCache();
  cache.put(key + ':meta', String(count), ttl);
  for (let i = 0; i < count; i++) cache.put(key + ':' + i, raw.slice(i * MAX, (i + 1) * MAX), ttl);
}

function cacheGetChunkedJson_(key) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(key + ':meta');
  if (!meta) return cacheGetJson_(key);
  const count = Number(meta) || 0;
  if (!count) return null;
  let raw = '';
  for (let i = 0; i < count; i++) {
    const part = cache.get(key + ':' + i);
    if (part === null) return null;
    raw += part;
  }
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function cacheRemove_(key) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(key + ':meta');
  const count = Number(meta) || 0;
  if (count) {
    const keys = [key + ':meta'];
    for (let i = 0; i < count; i++) keys.push(key + ':' + i);
    cache.removeAll(keys);
  } else {
    cache.remove(key);
    cache.remove(key + ':meta');
  }
}

function invalidatePublicCaches_() {
  cacheRemove_(CATALOG_CACHE_KEY);
  cacheRemove_(REVIEWS_CACHE_KEY);
  cacheRemove_(REVIEW_SUMMARY_CACHE_KEY);
  cacheRemove_(PROMOS_CACHE_KEY);
  cacheRemove_(DASHBOARD_CACHE_KEY);
}

function invalidateDashboardCache_() {
  cacheRemove_(DASHBOARD_CACHE_KEY);
}

function safeNumber_(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : (fallback || 0);
}

function cleanPhone_(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function hashText_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return bytes.map(b => {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

/* ---------------- Products ---------------- */

function getAllProducts(includeCost) {
  // Admin data contains costPrice and must never be cached under the public key.
  if (!includeCost) {
    const cached = cacheGetChunkedJson_(CATALOG_CACHE_KEY);
    if (Array.isArray(cached)) return cached;
  }
  const rows = rowsAsObjects_(getSheet_(PRODUCTS_SHEET));
  if (includeCost) return rows;
  const publicRows = rows.map(r => {
    const copy = Object.assign({}, r);
    delete copy.costprice;
    return copy;
  });
  cachePutJson_(CATALOG_CACHE_KEY, publicRows, CATALOG_CACHE_TTL);
  return publicRows;
}

function addProduct(p) {
  // Locked so two nearly-simultaneous adds (a double-tap on Save, for
  // instance) can't both compute "the next free ID" before either one has
  // actually written its row — that race is exactly how two products can
  // end up with the same ID.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(PRODUCTS_SHEET);
    const heads = headers_(sheet);
    const idCol = heads.indexOf('id');
    const typedId = (p.id && String(p.id).trim()) ? String(p.id).trim() : '';
    if (typedId) {
      const data = sheet.getDataRange().getValues();
      const exists = data.slice(1).some(row => String(row[idCol]) === typedId);
      if (exists) return { success: false, error: 'A product with ID "' + typedId + '" already exists.' };
    }
    const id = typedId || nextId_(sheet, 'DSB');
    const row = heads.map(h => h === 'id' ? id : (p[h] !== undefined ? p[h] : ''));
    sheet.appendRow(row);
    invalidatePublicCaches_();
    return { success: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function updateProduct(p) {
  if (!p.id) return { success: false, error: 'missing id' };
  const sheet = getSheet_(PRODUCTS_SHEET);
  const heads = headers_(sheet);
  const data = sheet.getDataRange().getValues();
  const idCol = heads.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(p.id)) {
      const row = heads.map((h, colIdx) => p[h] !== undefined ? p[h] : data[i][colIdx]);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      invalidatePublicCaches_();
      return { success: true };
    }
  }
  return { success: false, error: 'product not found' };
}

function deleteProduct(id) {
  if (!id) return { success: false, error: 'missing id' };
  const sheet = getSheet_(PRODUCTS_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      invalidatePublicCaches_();
      return { success: true };
    }
  }
  return { success: false, error: 'product not found' };
}

/* ---------------- Reviews ---------------- */

function getCachedReviews_() {
  const cached = cacheGetChunkedJson_(REVIEWS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  const rows = rowsAsObjects_(getSheet_(REVIEWS_SHEET));
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  cachePutJson_(REVIEWS_CACHE_KEY, rows, REVIEWS_CACHE_TTL);
  return rows;
}

function getReviews(productId) {
  const rows = getCachedReviews_();
  if (!productId) return rows;
  return rows.filter(r => String(r.productid) === String(productId));
}

function getReviewSummaries() {
  const cached = cacheGetJson_(REVIEW_SUMMARY_CACHE_KEY);
  if (cached) return cached;
  const rows = getCachedReviews_();
  const totals = {};
  rows.forEach(r => {
    const pid = String(r.productid || '').trim();
    if (!pid) return;
    const rating = Math.min(5, Math.max(1, safeNumber_(r.rating, 0)));
    if (!totals[pid]) totals[pid] = { avg: 0, count: 0, sum: 0 };
    totals[pid].sum += rating;
    totals[pid].count += 1;
  });
  const summary = {};
  Object.keys(totals).forEach(pid => {
    summary[pid] = { avg: totals[pid].count ? totals[pid].sum / totals[pid].count : 0, count: totals[pid].count };
  });
  cachePutJson_(REVIEW_SUMMARY_CACHE_KEY, summary, REVIEW_SUMMARY_CACHE_TTL);
  return summary;
}

function addReview(r) {
  const productId = r.productId || r.productid;
  if (!productId) return { success: false, error: 'missing productId' };
  const sheet = getSheet_(REVIEWS_SHEET);
  const heads = headers_(sheet);
  const record = {
    id: 'REV-' + Utilities.getUuid().slice(0, 8),
    productid: productId,
    name: (r.name || 'Anonymous').toString().slice(0, 60),
    rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
    comment: (r.comment || '').toString().slice(0, 600),
    date: new Date()
  };
  const row = heads.map(h => record[h] !== undefined ? record[h] : '');
  sheet.appendRow(row);
  cacheRemove_(REVIEW_SUMMARY_CACHE_KEY);
  cacheRemove_(REVIEWS_CACHE_KEY);
  return { success: true, id: record.id };
}

/* ---------------- Promos ---------------- */
// A promo is only ever returned here if its "active" column reads "yes" —
// inactive/expired codes are never sent to the browser at all.

function getActivePromos() {
  const cached = cacheGetJson_(PROMOS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  let sheet;
  try {
    sheet = getSheet_(PROMOS_SHEET);
  } catch (err) {
    return [];
  }
  const rows = rowsAsObjects_(sheet);
  const promos = rows
    .filter(r => String(r.active).trim().toLowerCase() === 'yes')
    .map(r => ({
      code: String(r.code || '').trim(),
      type: String(r.type || '').trim().toLowerCase(),
      value: Number(r.value) || 0
    }))
    .filter(r => r.code);
  cachePutJson_(PROMOS_CACHE_KEY, promos, PROMOS_CACHE_TTL);
  return promos;
}

/* ---------------- Orders ---------------- */

function getAllOrders() {
  return rowsAsObjects_(getSheet_(ORDERS_SHEET));
}

// Server-side dashboard aggregation keeps the browser light. The short cache
// absorbs repeated refreshes; product/order mutations explicitly invalidate it.
function getDashboardData() {
  const cached = cacheGetJson_(DASHBOARD_CACHE_KEY);
  if (cached) return cached;

  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const monthKey = Utilities.formatDate(now, tz, 'yyyy-MM');
  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  const statusCounts = {};
  const cancelledIds = {};
  let todayRevenue = 0, todayOrders = 0, monthRevenue = 0, monthOrders = 0;

  orders.forEach(order => {
    const status = String(order.status || 'Pending').trim() || 'Pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'Cancelled') cancelledIds[String(order.orderid || '')] = true;
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || status === 'Cancelled') return;
    const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const orderMonth = Utilities.formatDate(date, tz, 'yyyy-MM');
    const total = Math.max(0, safeNumber_(order.total, 0));
    if (dateKey === todayKey) { todayRevenue += total; todayOrders += 1; }
    if (orderMonth === monthKey) { monthRevenue += total; monthOrders += 1; }
  });

  const products = rowsAsObjects_(getSheet_(PRODUCTS_SHEET));
  const lowStock = products
    .filter(p => p.stockqty !== '' && p.stockqty !== null && p.stockqty !== undefined && safeNumber_(p.stockqty, -1) >= 0 && safeNumber_(p.stockqty, -1) <= 5)
    .map(p => ({ id: p.id, name: p.name || p.id, qty: Math.max(0, Math.floor(safeNumber_(p.stockqty, 0))) }))
    .sort((a, b) => a.qty - b.qty || String(a.name).localeCompare(String(b.name)));

  let monthProfit = 0;
  const productStats = {};
  try {
    const items = rowsAsObjects_(getSheet_(ORDER_ITEMS_SHEET));
    items.forEach(item => {
      const orderId = String(item.orderid || '');
      if (cancelledIds[orderId]) return;
      const date = new Date(item.date);
      if (isNaN(date.getTime()) || Utilities.formatDate(date, tz, 'yyyy-MM') !== monthKey) return;
      const qty = Math.max(0, safeNumber_(item.qty, 0));
      const revenue = Math.max(0, safeNumber_(item.linerevenue, safeNumber_(item.unitprice, 0) * qty));
      const cost = Math.max(0, safeNumber_(item.linecost, safeNumber_(item.costprice, 0) * qty));
      monthProfit += safeNumber_(item.lineprofit, revenue - cost);
      const key = String(item.productid || item.productname || 'Unknown');
      if (!productStats[key]) productStats[key] = { name: item.productname || key, qty: 0, revenue: 0 };
      productStats[key].qty += qty;
      productStats[key].revenue += revenue;
    });
  } catch (err) {
    // OrderItems is optional; the rest of the dashboard still works.
  }

  const topProducts = Object.keys(productStats).map(k => productStats[k])
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 5);
  const dashboard = { todayRevenue, todayOrders, monthRevenue, monthOrders, monthProfit, statusCounts, lowStock, topProducts };
  cachePutJson_(DASHBOARD_CACHE_KEY, dashboard, DASHBOARD_CACHE_TTL);
  return dashboard;
}

// Exact lookup avoids loading/scanning every order just to change one status.
function updateOrderStatus(orderId, statusValue) {
  const id = String(orderId || '').trim();
  const status = String(statusValue || '').trim();
  if (!id) return { success: false, error: 'missing orderId' };
  if (ALLOWED_ORDER_STATUSES.indexOf(status) === -1) return { success: false, error: 'invalid order status' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(ORDERS_SHEET);
    if (sheet.getLastRow() < 2) return { success: false, error: 'order not found' };
    const heads = headers_(sheet);
    const idCol = heads.indexOf('orderid');
    const statusCol = heads.indexOf('status');
    if (idCol === -1 || statusCol === -1) return { success: false, error: 'Orders sheet is missing orderId/status columns' };
    const hit = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!hit) return { success: false, error: 'order not found' };
    sheet.getRange(hit.getRow(), statusCol + 1).setValue(status);
    invalidateDashboardCache_();
    return { success: true, orderId: id, status: status };
  } finally {
    lock.releaseLock();
  }
}

function addOrder(o) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let result;
  try {
    const order = normalizeAndValidateOrder_(o || {});
    if (!order.ok) return order;

    const sheets = getOrderSheets_();
    const id = newOrderId_();
    const now = new Date();

    // Recalculate everything from authoritative server-side product data.
    const priced = buildValidatedOrderItems_(order.itemsDetail, sheets.productData);
    if (!priced.ok) return priced;

    const subtotal = priced.subtotal;
    let discount = 0;
    let promoRejected = false;
    let promoCode = order.promoCode;
    if (promoCode) {
      const verdict = validatePromoFast_(promoCode, order.phone);
      if (verdict.ok) discount = Math.min(Math.max(verdict.discountFor(subtotal), 0), subtotal);
      else { promoRejected = true; promoCode = ''; }
    }
    const total = Math.max(0, subtotal - discount);

    // All business validations have passed before any write happens.
    // Stock changes are captured so an unexpected order-sheet write failure
    // can be rolled back instead of leaving inventory out of sync.
    const stockChanges = decrementValidatedStock_(priced.items, sheets);

    const record = {
      orderid: id, date: now, customername: order.customerName, phone: order.phone,
      address: order.address, paymentmethod: order.paymentMethod, promocode: promoCode,
      discount: discount, items: priced.summary, total: total, status: 'Pending'
    };
    const heads = sheets.orderHeads;
    const row = heads.map(h => record[h] !== undefined ? record[h] : '');
    try {
      sheets.orders.appendRow(row);
    } catch (writeErr) {
      rollbackStock_(stockChanges, sheets);
      throw writeErr;
    }

    // The order row is now committed. Optional accounting/notification
    // bookkeeping must never turn a successfully placed order into a client
    // error (which could cause the customer to retry and create a duplicate).
    try { recordOrderItemsFromValidated_(id, now, priced.items); } catch (err) { console.error(err); }
    try { registerPromoUse_(promoCode, order.phone); } catch (err) { console.error(err); }
    try { invalidatePublicCaches_(); } catch (err) { console.error(err); }

    result = {
      success: true, orderId: id, promoRejected: promoRejected,
      subtotal: subtotal, correctedTotal: total, discount: discount,
      items: priced.items.map(item => ({ id: item.id, name: item.name, qty: item.qty, unitPrice: item.unitPrice, lineTotal: item.lineTotal }))
    };
  } catch (err) {
    result = { success: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }

  if (result && result.success) {
    const telegramRecord = {
      orderid: result.orderId, customername: String(o.customerName || o.customername || '').slice(0, 100),
      phone: cleanPhone_(o.phone), address: String(o.address || '').slice(0, 500),
      paymentmethod: result.items ? String(o.paymentMethod || 'Cash on Delivery').slice(0, 30) : 'Cash on Delivery',
      items: result.items.map(x => `${x.id} ${x.name} x${x.qty}`).join(' | '),
      promocode: String(o.promoCode || o.promocode || '').trim(), discount: result.discount, total: result.correctedTotal
    };
    notifyTelegramOrder_(telegramRecord);
  }
  return result;
}

function normalizeAndValidateOrder_(o) {
  const customerName = String(o.customerName || o.customername || '').trim().slice(0, 100);
  const phone = cleanPhone_(o.phone);
  const address = String(o.address || '').trim().slice(0, 500);
  const paymentMethod = ALLOWED_PAYMENT_METHODS.indexOf(String(o.paymentMethod || o.paymentmethod || 'Cash on Delivery')) !== -1
    ? String(o.paymentMethod || o.paymentmethod || 'Cash on Delivery') : '';
  const promoCode = String(o.promoCode || o.promocode || '').trim().toUpperCase().slice(0, 30);

  if (customerName.length < 2) return { success: false, error: 'Please provide a valid customer name.' };
  if (!/^\d{10,15}$/.test(phone)) return { success: false, error: 'Please provide a valid phone number.' };
  if (address.length < 5) return { success: false, error: 'Please provide a valid delivery address.' };
  if (!paymentMethod) return { success: false, error: 'Unsupported payment method.' };
  if (!Array.isArray(o.itemsDetail) || !o.itemsDetail.length || o.itemsDetail.length > 50) return { success: false, error: 'Cart is empty or too large.' };

  const itemsDetail = o.itemsDetail.map(x => ({ id: String(x && x.id || '').trim(), qty: Math.floor(safeNumber_(x && x.qty, 0)) }))
    .filter(x => x.id && x.qty > 0);
  if (!itemsDetail.length) return { success: false, error: 'Cart is empty.' };
  const seen = {};
  for (const item of itemsDetail) {
    if (seen[item.id]) return { success: false, error: 'Duplicate product in cart.' };
    seen[item.id] = true;
    if (item.qty > 999) return { success: false, error: 'Invalid quantity.' };
  }
  return { ok: true, customerName, phone, address, paymentMethod, promoCode, itemsDetail };
}

function getOrderSheets_() {
  const productSheet = getSheet_(PRODUCTS_SHEET);
  const productHeads = headers_(productSheet);
  const productData = productSheet.getDataRange().getValues();
  return {
    productSheet: productSheet,
    productHeads: productHeads,
    productData: productData,
    orders: getSheet_(ORDERS_SHEET),
    orderHeads: headers_(getSheet_(ORDERS_SHEET))
  };
}

function newOrderId_() {
  // Non-sequential IDs prevent easy enumeration during public tracking.
  return 'ORD-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
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
  if (idCol === -1 || priceCol === -1) return { ok: false, error: 'Products sheet is missing id/price columns.' };

  const byId = {};
  for (let i = 1; i < productData.length; i++) {
    const pid = String(productData[i][idCol] || '').trim();
    if (pid) byId[pid] = { rowIndex: i, row: productData[i] };
  }

  const items = [];
  let subtotal = 0;
  for (const requested of itemsDetail) {
    const found = byId[requested.id];
    if (!found) return { ok: false, error: `Product ${requested.id} is no longer available.` };
    const row = found.row;
    const status = String(stockCol === -1 ? 'in stock' : row[stockCol] || 'in stock').trim().toLowerCase();
    if (status === 'out of stock') return { ok: false, error: `${row[nameCol] || requested.id} is out of stock.` };

    const unitPrice = safeNumber_(row[priceCol], 0);
    if (unitPrice < 0) return { ok: false, error: 'Invalid product price.' };

    let tracked = false;
    let availableQty = null;
    if (qtyCol !== -1 && row[qtyCol] !== '' && row[qtyCol] !== null && row[qtyCol] !== undefined) {
      tracked = true;
      availableQty = Math.max(0, Math.floor(safeNumber_(row[qtyCol], 0)));
      if (requested.qty > availableQty) {
        return { ok: false, error: `Only ${availableQty} left for ${row[nameCol] || requested.id}.`, code: 'insufficient_stock', productId: requested.id, availableQty: availableQty };
      }
    }

    const lineTotal = unitPrice * requested.qty;
    subtotal += lineTotal;
    items.push({
      id: requested.id, name: String(nameCol === -1 ? requested.id : row[nameCol] || requested.id),
      category: catCol === -1 ? '' : row[catCol], subcategory: subCol === -1 ? '' : row[subCol],
      qty: requested.qty, unitPrice, costPrice: costCol === -1 ? 0 : safeNumber_(row[costCol], 0),
      lineTotal, tracked, availableQty, rowIndex: found.rowIndex
    });
  }
  return { ok: true, items, subtotal, summary: items.map(x => `${x.id} ${x.name} x${x.qty}`).join(' | ') };
}


// Fires a Telegram message for a freshly-saved order. Purely best-effort:
// wrapped so a Telegram outage (or a blank token) never fails the order
// itself — the sheet row is already written by the time this runs. Nothing
// is shown to the customer either way, which is what makes it "silent".
function notifyTelegramOrder_(record) {
  // Telegram is intentionally non-blocking: an order must NEVER fail just
  // because Telegram is unavailable. Unlike the previous version, failures
  // are logged so they can actually be diagnosed in Apps Script Executions.
  const token = String(TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    console.warn('Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is blank.');
    return { ok: false, skipped: true, error: 'Telegram is not configured' };
  }

  try {
    const lines = [
      '🛍️ *New Order*',
      '━━━━━━━━━━━━━━━━',
      '🧾 Order: `' + escapeTelegramMarkdown_(record.orderid) + '`',
      '👤 Name: ' + escapeTelegramMarkdown_(record.customername),
      '📱 Phone: ' + escapeTelegramMarkdown_(record.phone),
      '📍 Address: ' + escapeTelegramMarkdown_(record.address),
      '💳 Payment: ' + escapeTelegramMarkdown_(record.paymentmethod),
      '🛒 Items: ' + escapeTelegramMarkdown_(record.items)
    ];

    if (Number(record.discount) > 0) {
      lines.push('🏷️ Discount (' + escapeTelegramMarkdown_(record.promocode || 'Promo') + '): ₹' + Number(record.discount));
    }

    lines.push('💰 *Total: ₹' + Number(record.total || 0) + '*');
    lines.push('━━━━━━━━━━━━━━━━');

    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'Markdown'
      }),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const raw = response.getContentText();
    let data = null;
    try { data = JSON.parse(raw); } catch (ignore) {}

    if (status >= 200 && status < 300 && (!data || data.ok !== false)) {
      console.log('Telegram notification sent successfully for order ' + record.orderid + '.');
      return { ok: true };
    }

    // Keep diagnostics useful without printing the bot token.
    console.error(
      'Telegram notification failed for order ' + record.orderid +
      '. HTTP ' + status + '. Response: ' + raw.slice(0, 1000)
    );
    return { ok: false, error: data && data.description ? data.description : ('HTTP ' + status) };

  } catch (err) {
    console.error(
      'Telegram notification exception for order ' + String(record && record.orderid || 'unknown') +
      ': ' + (err && err.stack ? err.stack : err)
    );
    return { ok: false, error: String(err) };
  }
}

// Escapes customer/order text used with Telegram Markdown so names, addresses
// and product descriptions cannot accidentally break message formatting.
function escapeTelegramMarkdown_(value) {
  return String(value == null ? '' : value)
    .replace(/([_`*\\])/g, '\\$1');
}

// Run this manually from Apps Script after entering your token and chat ID.
// It is a safe connectivity test and does NOT create an order or modify sheets.
function testTelegramNotification() {
  return notifyTelegramOrder_({
    orderid: 'TEST-' + new Date().getTime(),
    customername: 'Telegram Test',
    phone: '0000000000',
    address: 'Apps Script connectivity test',
    paymentmethod: 'Test',
    items: 'Test notification',
    promocode: '',
    discount: 0,
    total: 0
  });
}

// Writes one permanent row per product in the order to OrderItems, snapshotting
// that product's price and cost AT THIS MOMENT — never recalculated later, so
// a future price change never rewrites past profit history. Silently does
// nothing if the OrderItems tab doesn't exist yet (orders still save fine).
function recordOrderItemsFromValidated_(orderId, date, items) {
  let itemsSheet;
  try { itemsSheet = getSheet_(ORDER_ITEMS_SHEET); } catch (err) { return; }
  const heads = headers_(itemsSheet);
  const rows = items.map(item => {
    const record = {
      orderid: orderId, date: date, productid: item.id, productname: item.name,
      category: item.category, subcategory: item.subcategory, qty: item.qty,
      unitprice: item.unitPrice, costprice: item.costPrice, linerevenue: item.lineTotal,
      linecost: item.qty * item.costPrice, lineprofit: item.lineTotal - (item.qty * item.costPrice)
    };
    return heads.map(h => record[h] !== undefined ? record[h] : '');
  });
  if (rows.length) itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rows.length, heads.length).setValues(rows);
}

function ensurePromoCustomersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROMO_CUSTOMERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PROMO_CUSTOMERS_SHEET);
    sheet.getRange(1, 1, 1, 3).setValues([['code', 'phonehash', 'date']]);
    try { sheet.hideSheet(); } catch (err) {}
  }
  return sheet;
}

function getPromoByCode_(code) {
  let sheet;
  try { sheet = getSheet_(PROMOS_SHEET); } catch (err) { return null; }
  const rows = rowsAsObjects_(sheet);
  return rows.find(r => String(r.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase() && String(r.active).trim().toLowerCase() === 'yes') || null;
}

function validatePromoFast_(code, phone) {
  const promo = getPromoByCode_(code);
  if (!promo) return { ok: false };
  const maxUses = (promo.maxuses === '' || promo.maxuses === undefined || promo.maxuses === null) ? null : Math.max(0, Math.floor(safeNumber_(promo.maxuses, 0)));
  const onePerCustomer = String(promo.onepercustomer || '').trim().toLowerCase() === 'yes';
  const usageCol = 'uses';
  const usedCount = Math.max(0, Math.floor(safeNumber_(promo[usageCol], 0)));
  if (maxUses !== null && usedCount >= maxUses) return { ok: false };

  if (onePerCustomer && phone) {
    const sheet = ensurePromoCustomersSheet_();
    const needle = String(code).trim().toLowerCase() + '|' + hashText_(phone);
    const hit = sheet.createTextFinder(needle).matchEntireCell(true).findNext();
    if (hit) return { ok: false };
  }

  const type = String(promo.type || '').trim().toLowerCase();
  const value = Math.max(0, safeNumber_(promo.value, 0));
  return {
    ok: true,
    discountFor(subtotal) { return type === 'percent' ? subtotal * (value / 100) : value; }
  };
}

function registerPromoUse_(code, phone) {
  if (!code) return;
  const sheet = getSheet_(PROMOS_SHEET);
  const heads = headers_(sheet);
  const codeCol = heads.indexOf('code');
  let usesCol = heads.indexOf('uses');
  if (usesCol === -1) {
    usesCol = heads.length;
    sheet.getRange(1, usesCol + 1).setValue('uses');
  }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][codeCol] || '').trim().toLowerCase() === String(code).trim().toLowerCase()) {
      sheet.getRange(i + 1, usesCol + 1).setValue(Math.max(0, Math.floor(safeNumber_(data[i][usesCol], 0))) + 1);
      cacheRemove_(PROMOS_CACHE_KEY);
      break;
    }
  }
  const rowForCode = data.slice(1).find(r => String(r[codeCol] || '').trim().toLowerCase() === String(code).trim().toLowerCase());
  const onePerCustomer = rowForCode && String(rowForCode[heads.indexOf('onepercustomer')] || '').trim().toLowerCase() === 'yes';
  if (onePerCustomer && phone) {
    const usageSheet = ensurePromoCustomersSheet_();
    usageSheet.appendRow([String(code).trim().toLowerCase() + '|' + hashText_(phone), hashText_(phone), new Date()]);
  }
}

function decrementValidatedStock_(items, sheets) {
  const heads = sheets.productHeads;
  const qtyCol = heads.indexOf('stockqty');
  const stockCol = heads.indexOf('stock');
  const changes = [];
  if (qtyCol === -1) return changes;

  items.forEach(item => {
    if (!item.tracked) return;
    const newQty = Math.max(0, item.availableQty - item.qty);
    const oldStock = stockCol === -1 ? null : sheets.productData[item.rowIndex][stockCol];
    sheets.productSheet.getRange(item.rowIndex + 1, qtyCol + 1).setValue(newQty);
    if (newQty === 0 && stockCol !== -1) sheets.productSheet.getRange(item.rowIndex + 1, stockCol + 1).setValue('out of stock');
    changes.push({ rowIndex: item.rowIndex, oldQty: item.availableQty, oldStock: oldStock });
  });
  return changes;
}

function rollbackStock_(changes, sheets) {
  if (!Array.isArray(changes)) return;
  const heads = sheets.productHeads;
  const qtyCol = heads.indexOf('stockqty');
  const stockCol = heads.indexOf('stock');
  if (qtyCol === -1) return;
  changes.forEach(change => {
    sheets.productSheet.getRange(change.rowIndex + 1, qtyCol + 1).setValue(change.oldQty);
    if (stockCol !== -1 && change.oldStock !== null && change.oldStock !== undefined) {
      sheets.productSheet.getRange(change.rowIndex + 1, stockCol + 1).setValue(change.oldStock);
    }
  });
}


// Public "Track your order" lookup — no admin key required. To keep this
// safe to expose without a login, it only ever returns an order when BOTH
// the exact orderId AND the last 4 digits of the phone number used at
// checkout are supplied. A wrong guess on either one gets the same generic
// "not found" answer, so this can't be used to fish for order IDs or leak
// whether a given ID exists.
function trackOrder(orderId, phone) {
  if (!orderId || !phone) return { success: false, error: 'missing orderId or phone' };
  const sheet = getSheet_(ORDERS_SHEET);
  const heads = headers_(sheet);
  const idCol = heads.indexOf('orderid');
  if (idCol === -1) return { success: false, error: 'not_found' };
  if (sheet.getLastRow() < 2) return { success: false, error: 'not_found' };

  // Look up one exact order row instead of loading the entire Orders sheet.
  const hit = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(orderId).trim()).matchEntireCell(true).findNext();
  if (!hit) return { success: false, error: 'not_found' };

  const row = sheet.getRange(hit.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  const order = {};
  heads.forEach((h, i) => order[h] = row[i]);
  const storedPhone = cleanPhone_(order.phone);
  const givenPhone = cleanPhone_(phone);
  if (!storedPhone || !givenPhone || storedPhone.slice(-4) !== givenPhone.slice(-4)) {
    return { success: false, error: 'not_found' };
  }

  return {
    success: true, orderId: order.orderid, date: order.date, status: order.status || 'Pending',
    items: order.items, total: order.total, discount: order.discount, paymentMethod: order.paymentmethod
  };
}
