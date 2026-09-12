/**
 * Dhatterwal Suhag Bhandar — Google Sheet backend
 * ------------------------------------------------
 * Paste this into Extensions > Apps Script on your product Google Sheet,
 * then deploy as a Web App. See SETUP.md for step-by-step instructions.
 *
 * Sheet tabs expected in this spreadsheet:
 *
 * "Products" — id | name | nameHindi | category | subcategory | price | mrp | costPrice | image | images | description | stock | stockQty | tags
 * "Reviews"  — id | productId | name | rating | comment | date
 * "Orders"   — orderId | date | customerName | phone | address | paymentMethod | promoCode | discount | deliveryCharge | codCharge | items | total | status
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
 * changes never rewrite history. This tab is created automatically if missing.
 * OrderTransactions is an internal recovery/retry journal created automatically.
 */

const PRODUCTS_SHEET = 'Products';
const REVIEWS_SHEET = 'Reviews';
const ORDERS_SHEET = 'Orders';
const PROMOS_SHEET = 'Promos';
const ORDER_ITEMS_SHEET = 'OrderItems';
const PROMO_CUSTOMERS_SHEET = 'PromoCustomers';
const CATALOG_CACHE_KEY = 'dsb.catalog.v4';
const JOURNAL_SHEET = 'OrderTransactions';
const COMPLETED_STATUSES = ['Delivered', 'Fulfilled'];
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

// Checkout fee settings. Edit these three values whenever your policy changes.
// Delivery is charged only when the discounted merchandise value is BELOW
// DELIVERY_FREE_ABOVE. Set a charge to 0 to disable it.
const DELIVERY_FREE_ABOVE = 499; // ₹ — orders at/above this merchandise value get free delivery
const DELIVERY_CHARGE = 40;      // ₹ — delivery fee below the threshold
const COD_CHARGE = 20;           // ₹ — extra fee when Cash on Delivery is selected
const ALLOWED_ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Fulfilled'];

// Set the ADMIN_KEY Script Property before deploying — the admin page uses it to
// add/delete products and manage orders. Anyone who has this key can edit
// your sheet and see customer order details.
const ADMIN_KEY = ''; // Prefer the ADMIN_KEY Script Property; never publish secrets in GitHub.

// Optional — silently pings a Telegram chat/channel the instant a new order
// comes in, so you don't have to keep the Sheet or admin page open to know.
// Leave TELEGRAM_BOT_TOKEN blank to turn this off entirely; nothing else
// about order-taking changes either way. See SETUP.md for how to get
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
  if (action === 'checkoutConfig') {
    return jsonResponse(getCheckoutConfig_());
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
    if (!e || !e.postData || e.postData.contents.length > 24000) return jsonResponse({success:false,code:'validation_failed',error:'Request is too large.'});
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'quoteOrder') return jsonResponse(quoteOrder(body.order || {}));
    if (body.action === 'orderResult') return jsonResponse(orderResult(body.requestId, body.phone));

    // Public actions — no admin key needed, customers use these from the site.
    if (body.action === 'addReview') {
      return jsonResponse(addReview(body.review || {}));
    }
    if (body.action === 'addOrder') {
      return jsonResponse(addOrder(body.order || {}));
    }

    // Everything below is an admin-only action.
    const actor = authenticateAdmin_(body.key);
    return jsonResponse(dispatchAdmin_(body, actor));
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


function getCheckoutConfig_() {
  return {
    checkoutVersion: 2,
    deliveryFreeAbove: Math.max(0, safeNumber_(DELIVERY_FREE_ABOVE, 0)),
    deliveryCharge: Math.max(0, safeNumber_(DELIVERY_CHARGE, 0)),
    codCharge: Math.max(0, safeNumber_(COD_CHARGE, 0))
  };
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
  return String(value || '').replace(/\D/g, '');
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
  const publicRows = rows.filter(r=>!isArchived_(r)).map(r => {
    const copy={};
    ['id','name','namehindi','category','subcategory','price','mrp','image','images','description','stock','stockqty','tags','sizes','sizeprices'].forEach(key=>{if(r[key]!==undefined)copy[key]=r[key];});
    return copy;
  });
  cachePutJson_(CATALOG_CACHE_KEY, publicRows, CATALOG_CACHE_TTL);
  return publicRows;
}

function addProduct(p,requestId) {
  return withWriteLock_(function() {
    validateProductFields_(p, true);
    const retired=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DeletedProductIds');
    if(p.id&&retired&&findRow_(retired,'id',String(p.id).trim()))throw new Error('This product ID was retired. Choose a new ID.');
    if(p.sizes !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET),'sizes');
    if(p.sizeprices !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET),'sizeprices');
    const sheet = getSheet_(PRODUCTS_SHEET), heads = headers_(sheet);
    let reservation=null;
    if(requestId){
      if(!validRequestId_(requestId))throw new Error('Invalid save request. Refresh the admin page.');
      const ss=SpreadsheetApp.getActiveSpreadsheet();let requests=ss.getSheetByName('AdminProductRequests');
      if(!requests){requests=ss.insertSheet('AdminProductRequests');requests.appendRow(['id','productid','fingerprint']);try{requests.hideSheet();}catch(_){}}
      const fingerprint=hashText_(JSON.stringify(p)),row=findRow_(requests,'id',requestId);
      if(row){const values=requests.getRange(row,1,1,3).getValues()[0];if(values[2]!==fingerprint)throw new Error('This save attempt belongs to different product details.');reservation={requests,id:String(values[1]),existing:true};}
      else{
        let candidate=String(p.id || '').trim() || nextId_(sheet,'DSB');
        if(!p.id){while(findRow_(requests,'productid',candidate)||(retired&&findRow_(retired,'id',candidate))){const n=Number(candidate.replace(/^DSB-?/,''))+1;candidate='DSB-'+String(n).padStart(4,'0');}}
        if(findRow_(sheet,'id',candidate) || findRow_(requests,'productid',candidate))throw new Error('That product ID is already used or reserved.');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(candidate)) throw new Error('Use letters, numbers, hyphens or underscores for product IDs.');
        requests.appendRow([requestId,candidate,fingerprint]);SpreadsheetApp.flush();reservation={requests,id:candidate};
      }
      if(reservation.existing && findRow_(sheet,'id',reservation.id))return {success:true,id:reservation.id,replayed:true};
    }
    let id = reservation ? reservation.id : (String(p.id || '').trim() || nextId_(sheet, 'DSB'));
    if(!p.id&&!reservation&&retired){while(findRow_(retired,'id',id)){const n=Number(id.replace(/^DSB-?/,''))+1;id='DSB-'+String(n).padStart(4,'0');}}
    if(retired&&findRow_(retired,'id',id))throw new Error('This product ID was retired. Choose a new ID.');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Use letters, numbers, hyphens or underscores for product IDs.');
    if (findRow_(sheet, 'id', id)) throw new Error('That product ID already exists.');
    sheet.appendRow(heads.map(h => sheetText_(h === 'id' ? id : (p[h] !== undefined ? p[h] : ''))));
    invalidatePublicCaches_();
    return {success:true,id:id};
  });
}


function updateProduct(p) {
  return withWriteLock_(function() {
    validateProductFields_(p, false);
    if(p.sizes !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET),'sizes');
    if(p.sizeprices !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET),'sizeprices');
    const sheet = getSheet_(PRODUCTS_SHEET), heads = headers_(sheet);
    const row = findRow_(sheet, 'id', String(p.id || '').trim());
    if (!row) throw new Error('Product not found.');
    if(p.expected_revision){const current={};sheet.getRange(row,1,1,heads.length).getValues()[0].forEach((v,i)=>current[heads[i]]=v);if(productRevision_(current)!==p.expected_revision)throw new Error('Product changed since editing began. Refresh and reopen it before saving.');}
    ['stockqty','stock'].forEach(key => {
      const expected = p['expected_' + key];
      if (expected === undefined) { if (p[key] !== undefined) throw new Error('Refresh the admin page before editing stock.'); return; }
      if (String(p[key] == null ? '' : p[key]) === String(expected)) { delete p[key]; return; }
      const col = heads.indexOf(key);
      if (col >= 0 && String(sheet.getRange(row,col+1).getValue()) !== String(expected)) throw new Error('Stock changed since this form was opened. Reload products before editing stock.');
    });
    // Write only explicitly edited fields; do not rewrite unrelated formulas.
    const edits=heads.map((h,i)=>({col:i+1,value:sheetText_(p[h]),edited:h!=='id' && p[h]!==undefined})).filter(x=>x.edited);
    for(let i=0;i<edits.length;){let j=i+1;while(j<edits.length && edits[j].col===edits[j-1].col+1)j++;sheet.getRange(row,edits[i].col,1,j-i).setValues([edits.slice(i,j).map(x=>x.value)]);i=j;}
    invalidatePublicCaches_();
    return {success:true};
  });
}


function deleteProduct(id,expectedRevision) {
  id=String(id||'').trim();
  return withWriteLock_(function() {
    const sheet=getSheet_(PRODUCTS_SHEET),row=findRow_(sheet,'id',String(id||'').trim());
    if(!row)throw new Error('Product not found. Refresh the archive.');
    const heads=headers_(sheet),product={};sheet.getRange(row,1,1,heads.length).getValues()[0].forEach((v,i)=>product[heads[i]]=v);
    if(!isArchived_(product))throw new Error('Archive this product before deleting it.');
    if(!expectedRevision||productRevision_(product)!==expectedRevision)throw new Error('Product changed. Refresh the archive before deleting.');
    // Reserve only the ID so historical orders cannot affect a new product with the same ID.
    const ss=SpreadsheetApp.getActiveSpreadsheet();let reserved=ss.getSheetByName('DeletedProductIds');
    if(!reserved){reserved=ss.insertSheet('DeletedProductIds');reserved.appendRow(['id']);}
    if(!findRow_(reserved,'id',String(id)))reserved.appendRow([sheetText_(String(id))]);
    sheet.deleteRow(row);invalidatePublicCaches_();return {success:true};
  });
}


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
  return withWriteLock_(function() {
    const productId = String(r.productId || r.productid || '').trim();
    const name = String(r.name || '').trim(), comment = String(r.comment || '').trim(), rating = Number(r.rating);
    if (r.website || !name || name.length > 60 || comment.length < 2 || comment.length > 600 || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Please enter a name, a rating from 1 to 5 and feedback of 2–600 characters.');
    if (!findRow_(getSheet_(PRODUCTS_SHEET), 'id', productId)) throw new Error('Product not found.');
    const identity = hashText_(productId + '|' + name.toLowerCase() + '|' + comment.toLowerCase());
    rateLimit_('review-duplicate:' + identity, 1, 86400);
    rateLimit_('review-client:' + String(r.clientId || identity).slice(0,80), 3, 3600);
    rateLimit_('reviews-global', 60, 3600);
    const sheet = getSheet_(REVIEWS_SHEET), heads = headers_(sheet);
    const record = {id:'REV-' + Utilities.getUuid().slice(0,8),productid:productId,name:name,rating:rating,comment:comment,date:new Date()};
    sheet.appendRow(heads.map(h => sheetText_(record[h] !== undefined ? record[h] : '')));
    cacheRemove_(REVIEW_SUMMARY_CACHE_KEY); cacheRemove_(REVIEWS_CACHE_KEY);
    return {success:true,id:record.id};
  });
}


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

function getAllOrders(options) {
  const all=rowsAsObjects_(getSheet_(ORDERS_SHEET));
  if(!options)return all;
  const q=String(options.query||'').trim().toLowerCase().slice(0,100),status=String(options.status||'all');
  const list=all.filter(o=>(!options.payment||options.payment==='all'||(o.paymentstatus||'Unverified')===options.payment)&&(status==='all'||(o.status||'Pending')===status)&&(!q||`${o.customername} ${o.phone} ${o.orderid}`.toLowerCase().includes(q)));
  list.sort((a,b)=>options.sort==='name-asc'?String(a.customername||'').localeCompare(String(b.customername||'')):(options.sort==='date-asc'?1:-1)*(new Date(a.date)-new Date(b.date)));
  const pageSize=40,page=Math.max(0,Math.min(Math.floor(Number(options.page)||0),Math.max(0,Math.ceil(list.length/pageSize)-1)));
  return {orders:list.slice(page*pageSize,(page+1)*pageSize),page,pageSize,total:list.length,allCount:all.length};
}

// Server-side dashboard aggregation keeps the browser light. Completed order
// figures are read fresh, with discounts deducted from merchandise profit.
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
  let todayRevenue = 0, todayOrders = 0, monthRevenue = 0, monthOrders = 0;

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
      if (!productStats[key]) productStats[key] = { name: item.productname || key, qty: 0, revenue: 0 };
      productStats[key].qty += qty;
      productStats[key].revenue += revenue;
    });
  } catch (err) {
    // OrderItems is optional; the rest of the dashboard still works.
  }

  Object.keys(accounted).forEach(id => { monthProfit -= Math.max(0,safeNumber_(completedOrders[id].discount,0)); });
  monthProfit = roundMoney_(monthProfit);
  const accountingIncomplete = Object.keys(completedOrders).some(id => { const d = new Date(completedOrders[id].date); return Utilities.formatDate(d,tz,'yyyy-MM') === monthKey && !accounted[id]; });
  const topProducts = Object.keys(productStats).map(k => productStats[k])
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 5);
  const recentOrders=orders.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const sevenDaySales=[];
  for(let i=6;i>=0;i--){const day=new Date(now.getTime()-i*86400000);sevenDaySales.push({key:Utilities.formatDate(day,tz,'yyyy-MM-dd'),label:Utilities.formatDate(day,tz,'EEE'),total:0});}
  orders.forEach(o=>{if(COMPLETED_STATUSES.indexOf(o.status)<0)return;const d=new Date(o.date);if(isNaN(d.getTime()))return;const slot=sevenDaySales.find(x=>x.key===Utilities.formatDate(d,tz,'yyyy-MM-dd'));if(slot)slot.total+=Math.max(0,safeNumber_(o.total,0));});
  const telegram=getTelegramHealth_();
  const dashboard = { todayRevenue, todayOrders, monthRevenue, monthOrders, monthProfit, accountingIncomplete, statusCounts, lowStock, topProducts, recentOrders, sevenDaySales, telegram };
  return dashboard;
}

// Exact lookup avoids loading/scanning every order just to change one status.
function updateOrderStatus(orderId, statusValue) {
  return withWriteLock_(function() {
    const id = String(orderId || '').trim(), status = String(statusValue || '').trim();
    if (!id || ALLOWED_ORDER_STATUSES.indexOf(status) < 0) throw new Error('Invalid order or status.');
    const sheet = getSheet_(ORDERS_SHEET), heads = headers_(sheet), row = findRow_(sheet,'orderid',id), col = heads.indexOf('status') + 1;
    if (!row || col < 1) throw new Error('Order not found or status column missing.');
    const oldStatus = String(sheet.getRange(row,col).getValue() || 'Pending');
    if (oldStatus === status) return {success:true,orderId:id,status:status};
    const stock = statusStockPlan_(id,oldStatus,status);
    const journal = transactionSheet_(), data = {kind:'status',orderId:id,oldStatus:oldStatus,newStatus:status,stock:stock};
    const jr = saveTransaction_(journal,0,'STATUS-' + Utilities.getUuid(),'Pending',data);
    SpreadsheetApp.flush();
    try {
      applyStockPlan_(stock,true);
      sheet.getRange(row,col).setValue(status); SpreadsheetApp.flush();
      finishTransaction_(journal,jr,data,true);
    } catch(err) {
      const committed = String(sheet.getRange(row,col).getValue()) === status;
      finishTransaction_(journal,jr,data,committed);
      if (!committed) throw new Error('Status was not changed. Please retry.');
    }
    return {success:true,orderId:id,status:status};
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

  const fromItems = Object.keys(totals).map(id => ({ id: id, qty: totals[id] }));
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
    const hit = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(wantedId).matchEntireCell(true).findNext();
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
    return Object.keys(fallbackTotals).map(id => ({ id: id, qty: fallbackTotals[id] }));
  } catch (err) {
    return [];
  }
}

// Stock and promo changes are handled by durable transaction plans below.


// Stock and promo changes are handled by durable transaction plans below.


function addOrder(o) {
  const result = withWriteLock_(function() {
    const order = normalizeAndValidateOrder_(o || {});
    if (!order.ok) return order;
    if (!validRequestId_(o.requestId)) return {success:false,error:'Please refresh the website before placing your order.',code:'upgrade_required'};
    const fingerprint = hashText_(JSON.stringify(order));
    const journal = transactionSheet_();
    let jr = findRow_(journal, 'id', o.requestId);
    if (jr) {
      const previous = readTransaction_(journal, jr);
      if (previous.data.fingerprint !== fingerprint) return {success:false,error:'This checkout attempt belongs to different order details.',code:'request_conflict'};
      if (previous.status === 'Committed') return Object.assign({}, previous.data.result, {replayed:true});
    }
    const sheets = getOrderSheets_(), quoted = priceOrder_(order, sheets);
    if (!quoted.ok) return Object.assign({code:'validation_failed'},quoted);
    if (o.quoteToken ? o.quoteToken !== quoted.quote.quoteToken : !sameCheckoutQuote_(o.expectedQuote,quoted.quote)) return {success:false,code:'quote_changed',error:'Prices or charges changed. Please review the updated total.',quote:quoted.quote};
    rateLimit_('order-phone:' + hashText_(order.phone), 5, 3600);
    rateLimit_('orders-global', 120, 3600);
    const id = 'ORD-' + hashText_(o.requestId).slice(0,16).toUpperCase(), now = new Date();
    const q = quoted.quote;
    const record = {orderid:id,date:now,customername:order.customerName,phone:order.phone,address:order.address,paymentmethod:order.paymentMethod,promocode:order.promoCode,discount:q.discount,deliverycharge:q.deliveryCharge,codcharge:q.codCharge,items:quoted.priced.summary,total:q.correctedTotal,status:'Pending'};
    const result = Object.assign({}, q, {success:true,orderId:id,orderDate:now,paymentMethod:order.paymentMethod,promoCode:order.promoCode});
    delete result.quoteToken;
    const data = {kind:'order',notifyAsync:true,orderId:id,fingerprint:fingerprint,phoneHash:hashText_(order.phone),record:record,result:result,items:quoted.priced.items,stock:stockPlan_(quoted.priced.items,sheets),promo:promoPlan_(order.promoCode,order.phone)};
    jr = saveTransaction_(journal, jr, o.requestId, 'Pending', data);
    // Durable preparation is flushed BEFORE stock is touched.
    SpreadsheetApp.flush();
    try {
      applyStockPlan_(data.stock, true, sheets);
      sheets.orders.appendRow(sheets.orderHeads.map(h => sheetText_(record[h] !== undefined ? record[h] : '')));
      SpreadsheetApp.flush();
      finishTransaction_(journal,jr,data,true,true);
    } catch(err) {
      // A failed response/write can be ambiguous: the order row is the commit marker.
      const committed = !!findRow_(sheets.orders,'orderid',id);
      try { finishTransaction_(journal,jr,data,committed); } catch(recoveryError) { console.error('Transaction recovery pending: ' + id); }
      if (!committed) return {success:false,error:'The order could not be completed. Use Retry to safely check again.',code:'retry_same_request'};
    }
    return result;
  });
  return result;
}


function normalizeAndValidateOrder_(o) {
  const customerName = String(o.customerName || o.customername || '').trim();
  const phone = cleanPhone_(o.phone), address = String(o.address || '').trim();
  const paymentMethod = String(o.paymentMethod || o.paymentmethod || 'Cash on Delivery');
  const promoCode = String(o.promoCode || o.promocode || '').trim().toUpperCase();
  if (o.website) return {success:false,code:'validation_failed',error:'Could not accept this request.'};
  if (customerName.length < 2 || customerName.length > 100) return {success:false,code:'validation_failed',error:'Please provide a valid customer name.'};
  if (!/^\d{10,15}$/.test(phone)) return {success:false,code:'validation_failed',error:'Please provide a valid phone number.'};
  if (address.length < 5 || address.length > 500) return {success:false,code:'validation_failed',error:'Please provide a valid delivery address.'};
  if (ALLOWED_PAYMENT_METHODS.indexOf(paymentMethod) < 0 || promoCode.length > 30) return {success:false,code:'validation_failed',error:'Invalid payment method or promo code.'};
  if (!Array.isArray(o.itemsDetail) || !o.itemsDetail.length || o.itemsDetail.length > 50) return {success:false,code:'validation_failed',error:'Cart is empty or too large.'};
  const seen = Object.create(null), itemsDetail = [];
  for (const x of o.itemsDetail) {
    const id = String(x && x.id || '').trim(), qty = Number(x && x.qty);
    const size=String(x && x.size || '').trim(), variantKey=JSON.stringify([id,size]);
    if (!id || id.length > 80 || size.length>40 || !Number.isInteger(qty) || qty < 1 || qty > 999 || seen[variantKey]) return {success:false,code:'validation_failed',error:'Invalid or duplicate cart item.'};
    seen[variantKey] = true; itemsDetail.push({id:id,qty:qty,...(size ? {size:size} : {})});
  }
  itemsDetail.sort((a,b) => a.id.localeCompare(b.id) || String(a.size || '').localeCompare(String(b.size || '')));
  return {ok:true,customerName:customerName,phone:phone,address:address,paymentMethod:paymentMethod,promoCode:promoCode,itemsDetail:itemsDetail};
}


function getOrderSheets_() {
  const productSheet = getSheet_(PRODUCTS_SHEET);
  const productData = productSheet.getDataRange().getValues();
  const productHeads = productData[0].map(h => String(h).trim().toLowerCase());
  const orderHeads = headers_(getSheet_(ORDERS_SHEET));
  if (['orderid','date','customername','phone','address','paymentmethod','promocode','discount','items','total','status'].some(h => orderHeads.indexOf(h)<0)) throw new Error('Orders sheet is missing required columns. Ask the shop to check setup.');
  return {
    productSheet: productSheet,
    productHeads: productHeads,
    productData: productData,
    orders: getSheet_(ORDERS_SHEET),
    orderHeads: orderHeads
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

  const byId = Object.create(null);
  for (let i = 1; i < productData.length; i++) {
    const pid = String(productData[i][idCol] || '').trim();
    if (pid) byId[pid] = { rowIndex: i, row: productData[i] };
  }

  const items = [];
  const requestedTotals=Object.create(null);
  itemsDetail.forEach(x=>{requestedTotals[x.id]=(requestedTotals[x.id] || 0)+x.qty;});
  let subtotal = 0;
  for (const requested of itemsDetail) {
    const found = byId[requested.id];
    if (!found) return { ok: false, error: `Product ${requested.id} is no longer available.` };
    const row = found.row;
    if(heads.indexOf('archived')>=0 && String(row[heads.indexOf('archived')]).toLowerCase()==='yes')return {ok:false,error:'This product is no longer available.'};
    const sizes=parseSizes_(heads.indexOf('sizes')<0 ? '' : row[heads.indexOf('sizes')]);
    const size=String(requested.size || '');
    if(sizes.length ? !sizes.includes(size) : !!size) return {ok:false,code:'invalid_size',error:'Please choose an available size for ' + (row[nameCol] || requested.id) + '.'};
    const status = String(stockCol === -1 ? 'in stock' : row[stockCol] || 'in stock').trim().toLowerCase();
    if (status === 'out of stock') return { ok: false, error: `${row[nameCol] || requested.id} is out of stock.` };

    let unitPrice = roundMoney_(Number(row[priceCol]));
    const sizePrices=parseSizePrices_(heads.indexOf('sizeprices')<0 ? '' : row[heads.indexOf('sizeprices')]);
    if(size && Number.isFinite(sizePrices[size])) unitPrice=roundMoney_(sizePrices[size]);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 10000000) return { ok: false, error: 'Invalid product price.' };

    let tracked = false;
    let availableQty = null;
    if (qtyCol !== -1 && row[qtyCol] !== '' && row[qtyCol] !== null && row[qtyCol] !== undefined) {
      tracked = true;
      availableQty = Number(row[qtyCol]);
      if (!Number.isInteger(availableQty) || availableQty < 0) return {ok:false,error:'Invalid inventory quantity. Please contact the shop.'};
      if (requestedTotals[requested.id] > availableQty) {
        return { ok: false, error: `Only ${availableQty} left for ${row[nameCol] || requested.id}.`, code: 'insufficient_stock', productId: requested.id, availableQty: availableQty };
      }
    }

    const lineTotal = roundMoney_(unitPrice * requested.qty);
    subtotal += lineTotal;
    items.push({
      id: requested.id, name: String(nameCol === -1 ? requested.id : row[nameCol] || requested.id),
      category: catCol === -1 ? '' : row[catCol], subcategory: subCol === -1 ? '' : row[subCol],
      qty: requested.qty, ...(size ? {size:size} : {}), unitPrice, costPrice: costCol === -1 ? 0 : safeNumber_(row[costCol], 0),
      lineTotal, tracked, availableQty, rowIndex: found.rowIndex
    });
  }
  return { ok: true, items, subtotal, summary: items.map(x => `${x.id} ${x.name}${x.size ? ' (Size: '+x.size+')' : ''} x${x.qty}`).join(' | ') };
}


// Fires a Telegram message for a freshly-saved order. Purely best-effort:
// wrapped so a Telegram outage (or a blank token) never fails the order
// itself — the sheet row is already written by the time this runs. Nothing
// is shown to the customer either way, which is what makes it "silent".
function notifyTelegramOrder_(record) {
  // Synchronous transport, called by the background worker or manual test only.
  const token = String(secret_('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN)).trim();
  const chatId = String(secret_('TELEGRAM_CHAT_ID', TELEGRAM_CHAT_ID)).trim();

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
    if (Number(record.deliverycharge) > 0) lines.push('🚚 Delivery: ₹' + Number(record.deliverycharge));
    if (Number(record.codcharge) > 0) lines.push('💵 COD fee: ₹' + Number(record.codcharge));

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ORDER_ITEMS_SHEET);
  if (!sheet) { sheet = ss.insertSheet(ORDER_ITEMS_SHEET); sheet.appendRow(['orderId','date','productId','productName','category','subcategory','qty','unitPrice','costPrice','lineRevenue','lineCost','lineProfit']); }
  if(items.some(x=>x.size)) ensureColumn_(sheet,'size');
  const heads = headers_(sheet), idColumn = heads.indexOf('orderid');
  if (idColumn < 0) throw new Error('OrderItems is missing orderId.');
  const hits = sheet.getLastRow()>1 ? sheet.getRange(2,idColumn+1,sheet.getLastRow()-1,1).createTextFinder(String(orderId)).matchEntireCell(true).findAll() : [];
  const existing = hits.map(hit => { const values=sheet.getRange(hit.getRow(),1,1,heads.length).getValues()[0]; const item={};heads.forEach((h,i)=>item[h]=values[i]);return item; });
  const rows = items.filter(item => !existing.some(r => String(r.productid) === item.id && String(r.size || '') === String(item.size || ''))).map(item => {
    const record = {orderid:orderId,date:new Date(date),productid:item.id,productname:item.name,size:item.size || '',category:item.category,subcategory:item.subcategory,qty:item.qty,unitprice:item.unitPrice,costprice:item.costPrice,linerevenue:item.lineTotal,linecost:roundMoney_(item.qty * item.costPrice),lineprofit:roundMoney_(item.lineTotal - item.qty * item.costPrice)};
    return heads.map(h => sheetText_(record[h] !== undefined ? record[h] : ''));
  });
  if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,heads.length).setValues(rows);
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
  const value = Number(promo.value);
  if (!['percent','flat','fixed'].includes(type) || !Number.isFinite(value) || value < 0 || (type === 'percent' && value > 100)) return {ok:false};
  return {
    ok: true,
    discountFor(subtotal) { return type === 'percent' ? subtotal * (value / 100) : value; }
  };
}

// Stock and promo changes are handled by durable transaction plans below.


function trackOrder(orderId, phone) {
  if (!orderId || !phone) return { success: false, error: 'missing orderId or phone' };
  rateLimit_('tracking:'+hashText_(String(orderId)),30,600);
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
  const trackingPhone = value => {const digits=cleanPhone_(value);return digits.length===12 && digits.startsWith('91') ? digits.slice(2) : digits.length===11 && digits.startsWith('0') ? digits.slice(1) : digits;};
  const storedPhone = trackingPhone(order.phone);
  const givenPhone = trackingPhone(phone);
  if (!storedPhone || !givenPhone || storedPhone !== givenPhone) {
    return { success: false, error: 'not_found' };
  }

  return {
    success: true, orderId: order.orderid, date: order.date, status: order.status || 'Pending',
    items: order.items, total: order.total, discount: order.discount, deliveryCharge: order.deliverycharge || 0, codCharge: order.codcharge || 0, paymentMethod: order.paymentmethod
  };
}

/* ---------------- Reliable checkout v2 ---------------- */
function secret_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
}
function roundMoney_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function sheetText_(value) {
  // Prevent customer-controlled text becoming a spreadsheet formula.
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}
function findRow_(sheet, column, value) {
  const col = headers_(sheet).indexOf(column);
  if (col < 0 || sheet.getLastRow() < 2 || !value) return 0;
  const hit = sheet.getRange(2,col+1,sheet.getLastRow()-1,1).createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findNext();
  return hit ? hit.getRow() : 0;
}
function validateProductFields_(p, adding) {
  if(p.sizes !== undefined){
    const raw=String(p.sizes), sizes=parseSizes_(raw);
    if(raw.length>1000 || sizes.length>30 || sizes.some(x=>x.length>40 || /[|<>\x00-\x1f]/.test(x))) throw new Error('Use up to 30 sizes, each at most 40 characters, without | or angle brackets.');
    p.sizes=sizes.join(', ');
  }
  if(p.sizeprices !== undefined){
    const raw=String(p.sizeprices||'');
    if(raw.length>2000) throw new Error('Size prices are too long.');
    let obj={};
    if(raw){try{obj=JSON.parse(raw);}catch(_){throw new Error('Invalid size-price data.');}}
    if(!obj || Array.isArray(obj) || typeof obj!=='object')throw new Error('Invalid size-price data.');
    const sizes=parseSizes_(p.sizes||'');
    Object.keys(obj).forEach(size=>{const n=Number(obj[size]);if(!sizes.includes(size)||!Number.isFinite(n)||n<=0||n>10000000)throw new Error('Each size price must match an available size and be a valid positive price.');obj[size]=roundMoney_(n);});
    p.sizeprices=Object.keys(obj).length?JSON.stringify(obj):'';
  }
  if (adding && !String(p.name || '').trim()) throw new Error('Product name is required.');
  if (adding || p.price !== undefined) {
    const n = Number(p.price);
    if (String(p.price == null ? '' : p.price).trim() === '' || !Number.isFinite(n) || n <= 0 || n > 10000000) throw new Error('Price must be a positive number.');
  }
  ['costprice','mrp','stockqty'].forEach(key => {
    if (p[key] === undefined || p[key] === '') return;
    const n = Number(p[key]);
    if (!Number.isFinite(n) || n < 0 || (key === 'stockqty' && !Number.isInteger(n))) throw new Error('Invalid ' + key + '.');
  });
}
function rateLimit_(key, limit, seconds) {
  // Best-effort abuse throttling. Apps Script exposes no trustworthy client IP;
  // these controls are not identity verification or a CAPTCHA replacement.
  const cache = CacheService.getScriptCache(), k = 'limit:' + hashText_(key);
  const now = Date.now();
  let state;
  try { state = JSON.parse(cache.get(k) || 'null'); } catch(err) {}
  if (!state || state.until <= now) state = {count:0,until:now + seconds * 1000};
  if (state.count >= limit) { const error=new Error('Too many attempts. Please try again later or contact the shop.'); error.dsbCode='rate_limited'; throw error; }
  state.count++;
  cache.put(k,JSON.stringify(state),Math.min(21600,Math.max(1,Math.ceil((state.until-now)/1000))));
}
function validRequestId_(id) { return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(id || '')); }
function withWriteLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return {success:false,code:'busy',error:'The shop is busy. Please retry in a moment.'};
  try { recoverTransactions_(); return fn(); }
  catch(err) { console.error(String(err)); return {success:false,error:String(err.message || err),code:err.dsbCode || 'retry_same_request'}; }
  finally { lock.releaseLock(); }
}
function quoteOrder(o) {
  return withWriteLock_(function() {
    const order = normalizeAndValidateOrder_(o || {});
    if (!order.ok) return order;
    rateLimit_('quotes:' + hashText_(order.phone),30,600);
    const priced = priceOrder_(order,getOrderSheets_());
    return priced.ok ? Object.assign({success:true},priced.quote) : priced;
  });
}
function priceOrder_(order, sheets) {
  const priced = buildValidatedOrderItems_(order.itemsDetail,sheets.productData);
  if (!priced.ok) return Object.assign({success:false},priced);
  let discount = 0;
  if (order.promoCode) {
    const promo = validatePromoFast_(order.promoCode,order.phone);
    if (!promo.ok) return {success:false,ok:false,code:'invalid_promo',error:'This promo is no longer available. Remove it or choose another code before ordering.'};
    discount = roundMoney_(Math.min(priced.subtotal,Math.max(0,promo.discountFor(priced.subtotal))));
  }
  const cfg = getCheckoutConfig_(), merchandiseTotal = roundMoney_(priced.subtotal-discount);
  const deliveryCharge = merchandiseTotal < cfg.deliveryFreeAbove ? cfg.deliveryCharge : 0;
  const codCharge = order.paymentMethod === 'Cash on Delivery' ? cfg.codCharge : 0;
  const quote = {subtotal:roundMoney_(priced.subtotal),discount:discount,merchandiseTotal:merchandiseTotal,deliveryCharge:deliveryCharge,codCharge:codCharge,correctedTotal:roundMoney_(merchandiseTotal+deliveryCharge+codCharge),items:priced.items.map(x => ({id:x.id,name:x.name,qty:x.qty,...(x.size ? {size:x.size} : {}),unitPrice:x.unitPrice,lineTotal:x.lineTotal}))};
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('CHECKOUT_SIGNING_KEY');
  if (!key) { key = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CHECKOUT_SIGNING_KEY',key); }
  quote.quoteToken = hashText_(key + JSON.stringify(order) + JSON.stringify(quote));
  return {ok:true,quote:quote,priced:priced};
}
function transactionSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(JOURNAL_SHEET);
  if (!sheet) { sheet = ss.insertSheet(JOURNAL_SHEET); sheet.appendRow(['id','status','payload','updated']); try { sheet.hideSheet(); } catch(err) {} }
  return sheet;
}
function saveTransaction_(sheet,row,id,status,data) {
  const raw = JSON.stringify(data);
  // A Sheets cell supports 50,000 characters. Fail before inventory changes.
  if (raw.length > 48000) throw new Error('This order is too large. Please place a smaller order.');
  row = row || sheet.getLastRow()+1;
  if(data.kind==='order' && data.notifyAsync) sheet.getRange(row,1,1,7).setValues([[id,status,raw,new Date(),'Pending',0,0]]);
  else sheet.getRange(row,1,1,4).setValues([[id,status,raw,new Date()]]);
  return row;
}
function readTransaction_(sheet,row) {
  const values = sheet.getRange(row,1,1,4).getValues()[0];
  return {id:values[0],status:values[1],data:JSON.parse(values[2])};
}
function recoverTransactions_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow()<2) return;
  const pending = sheet.getRange(2,2,sheet.getLastRow()-1,1).createTextFinder('Pending').matchEntireCell(true).findAll();
  pending.forEach(hit => {
    const transaction = readTransaction_(sheet,hit.getRow()), data = transaction.data;
    const orders = getSheet_(ORDERS_SHEET), row = findRow_(orders,'orderid',data.orderId);
    let committed = !!row;
    if (data.kind === 'status') committed = !!row && String(orders.getRange(row,headers_(orders).indexOf('status')+1).getValue()) === data.newStatus;
    finishTransaction_(sheet,hit.getRow(),data,committed);
  });
}
function finishTransaction_(sheet,row,data,committed,stockAlreadyApplied) {
  // Absolute values make recovery repeatable after a partial Sheets failure.
  if (!stockAlreadyApplied) applyStockPlan_(data.stock,committed);
  if (committed && data.kind === 'order') {
    recordOrderItemsFromValidated_(data.orderId,data.record.date,data.items);
    applyPromoPlan_(data.promo);
  }
  invalidatePublicCaches_();
  SpreadsheetApp.flush();
  sheet.getRange(row,2).setValue(committed ? 'Committed' : 'RolledBack');
  sheet.getRange(row,4).setValue(new Date());
  SpreadsheetApp.flush();
}
function stockPlan_(items,sheets) {
  const grouped=new Map();
  items.filter(x=>x.tracked).forEach(x=>{if(!grouped.has(x.id)) grouped.set(x.id,{...x,qty:0});grouped.get(x.id).qty+=x.qty;});
  const statusCol=sheets.productHeads.indexOf('stock');
  return Array.from(grouped.values()).map(x=>{
    const oldStatus=statusCol<0 ? null : sheets.productData[x.rowIndex][statusCol];
    return {id:x.id,beforeQty:x.availableQty,afterQty:x.availableQty-x.qty,beforeStatus:oldStatus,afterStatus:oldStatus===null ? null : (x.availableQty===x.qty ? 'out of stock' : oldStatus)};
  });
}

function applyStockPlan_(plan,forward,sheets) {
  if (!plan || !plan.length) return;
  const sheet = sheets ? sheets.productSheet : getSheet_(PRODUCTS_SHEET), data = sheets ? sheets.productData : sheet.getDataRange().getValues(), heads = data[0].map(h => String(h).trim().toLowerCase());
  const idCol = heads.indexOf('id'), qtyCol = heads.indexOf('stockqty'), statusCol = heads.indexOf('stock');
  if (idCol < 0 || qtyCol < 0) throw new Error('Inventory columns are missing; transaction recovery is required.');
  const rows = Object.create(null); data.slice(1).forEach((r,i) => { rows[String(r[idCol])] = i+2; });
  const columns=new Map();
  const add=(col,row,value)=>{if(!columns.has(col))columns.set(col,[]);columns.get(col).push({row,value});};
  plan.forEach(x=>{
    const row=rows[x.id];
    if(!row)throw new Error('Inventory recovery cannot find product '+x.id+'. Restore it before retrying.');
    add(qtyCol+1,row,forward?x.afterQty:x.beforeQty);
    const status=forward?x.afterStatus:x.beforeStatus;
    if(statusCol>=0 && status!==null)add(statusCol+1,row,status);
  });
  columns.forEach((edits,col)=>{
    edits.sort((a,b)=>a.row-b.row);
    for(let i=0;i<edits.length;){let j=i+1;while(j<edits.length && edits[j].row===edits[j-1].row+1)j++;sheet.getRange(edits[i].row,col,j-i,1).setValues(edits.slice(i,j).map(x=>[x.value]));i=j;}
  });
}
function statusStockPlan_(orderId,oldStatus,newStatus) {
  if ((oldStatus === 'Cancelled') === (newStatus === 'Cancelled')) return [];
  const items = getOrderItemQuantities_(orderId);
  if (!items.length) throw new Error('No item history found; inventory cannot be safely changed for this order.');
  const sheet = getSheet_(PRODUCTS_SHEET), data = sheet.getDataRange().getValues(), heads = data[0].map(h => String(h).trim().toLowerCase());
  const idCol = heads.indexOf('id'), qtyCol = heads.indexOf('stockqty'), statusCol = heads.indexOf('stock');
  if (qtyCol < 0) return [];
  const reactivating = oldStatus === 'Cancelled';
  return items.map(item => {
    const row = data.slice(1).find(r => String(r[idCol]) === item.id);
    if (!row) { if (reactivating) throw new Error('Cannot reactivate: product ' + item.id + ' was deleted.'); return null; }
    if (row[qtyCol] === '' || row[qtyCol] == null) return null;
    const beforeQty = Number(row[qtyCol]), afterQty = beforeQty + (reactivating ? -item.qty : item.qty);
    if (!Number.isInteger(beforeQty) || beforeQty < 0 || afterQty < 0) throw new Error('Insufficient or invalid stock for ' + item.id + '.');
    return {id:item.id,beforeQty:beforeQty,afterQty:afterQty,beforeStatus:statusCol < 0 ? null : row[statusCol],afterStatus:statusCol < 0 ? null : (afterQty ? 'in stock' : 'out of stock')};
  }).filter(Boolean);
}
function promoPlan_(code,phone) {
  if (!code) return null;
  const sheet = getSheet_(PROMOS_SHEET), heads = headers_(sheet);
  let col = heads.indexOf('uses');
  if (col < 0) { col = heads.length; sheet.getRange(1,col+1).setValue('uses'); }
  const data = sheet.getDataRange().getValues(), codeCol = heads.indexOf('code');
  const i = data.findIndex((r,i) => i>0 && String(r[codeCol]).trim().toUpperCase() === code);
  if (i < 1) throw new Error('Promo not found.');
  return {code:code,usesAfter:Math.max(0,Number(data[i][col]) || 0)+1,phoneHash:hashText_(phone),onePerCustomer:String(data[i][heads.indexOf('onepercustomer')] || '').toLowerCase() === 'yes'};
}
function applyPromoPlan_(plan) {
  if (!plan) return;
  const sheet = getSheet_(PROMOS_SHEET), heads = headers_(sheet), data = sheet.getDataRange().getValues();
  const i = data.findIndex((r,i) => i>0 && String(r[heads.indexOf('code')]).trim().toUpperCase() === plan.code);
  if (i < 1) throw new Error('Promo recovery requires the original promo row.');
  sheet.getRange(i+1,heads.indexOf('uses')+1).setValue(plan.usesAfter);
  if (plan.onePerCustomer) {
    const usage = ensurePromoCustomersSheet_(), needle = plan.code.toLowerCase() + '|' + plan.phoneHash;
    if (!usage.createTextFinder(needle).matchEntireCell(true).findNext()) usage.appendRow([needle,plan.phoneHash,new Date()]);
  }
}
function orderResult(requestId,phone) {
  return withWriteLock_(function() {
    if (!validRequestId_(requestId)) return {success:false,code:'not_found',error:'Order attempt not found.'};
    rateLimit_('lookup:' + requestId,30,600);
    const sheet = transactionSheet_(), row = findRow_(sheet,'id',requestId);
    if (!row) return {success:false,code:'not_found',error:'No order was saved for this attempt.'};
    const t = readTransaction_(sheet,row);
    if (t.data.phoneHash !== hashText_(cleanPhone_(phone))) return {success:false,code:'not_found',error:'Order attempt not found.'};
    if (t.status === 'Committed') return Object.assign({},t.data.result,{replayed:true});
    return {success:false,code:'not_found',error:'No order was saved for this attempt.'};
  });
}

function parseSizes_(value){return [...new Set(String(value || '').split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];}
function parseSizePrices_(value){try{const obj=value&&typeof value==='object'?value:JSON.parse(String(value||'{}'));const out={};Object.keys(obj||{}).forEach(k=>{const n=Number(obj[k]);if(Number.isFinite(n)&&n>0)out[String(k)]=n;});return out;}catch(_){return {};}}
function ensureColumn_(sheet,name){if(headers_(sheet).indexOf(name)<0) sheet.getRange(1,sheet.getLastColumn()+1).setValue(name);}

// Run ONCE from the Apps Script editor, then authorize the timer.
function setupTelegramBackground() {
  const sheet = transactionSheet_();
  sheet.getRange(1,5,1,3).setValues([['telegramStatus','telegramRetryAt','telegramAttempts']]);
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processTelegramQueue')) {
    ScriptApp.newTrigger('processTelegramQueue').timeBased().everyMinutes(1).create();
  }
  console.log('Background Telegram delivery enabled. Deploy this code to the existing web app.');
}
function processTelegramQueue() {
  // Separate from the inventory script lock: Telegram cannot block checkout.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1)) return;
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
    if (!sheet || sheet.getLastRow()<2) return;
    const started = Date.now();
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_RUN',String(started));
    const last=sheet.getLastRow();
    const hits=sheet.getRange(2,5,last-1,1).createTextFinder('Pending').matchEntireCell(true).findAll();
    let sent=0;
    for(const hit of hits){
      if(sent>=5 || Date.now()-started>45000)break;
      const row=hit.getRow(),state=sheet.getRange(row,5,1,3).getValues()[0];
      if(Number(state[1])>Date.now())continue;
      const transaction=readTransaction_(sheet,row);
      if(transaction.status==='Pending')continue;
      const data=transaction.data;
      if(transaction.status!=='Committed' || data.kind!=='order' || !data.notifyAsync){sheet.getRange(row,5).setValue('Skipped');continue;}
      const attempts = (Number(state[2]) || 0)+1;
      // Persist a retry deadline before transport, including hard execution failures.
      sheet.getRange(row,5,1,3).setValues([['Pending',Date.now()+Math.min(3600000,60000*Math.pow(2,Math.min(attempts-1,6))),attempts]]);
      SpreadsheetApp.flush();
      const result = notifyTelegramOrder_(data.record);
      if (result && result.ok) {
        sheet.getRange(row,5,1,3).setValues([['Sent',0,attempts]]);
        PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_SUCCESS',String(Date.now()));
        SpreadsheetApp.flush();
      }
      sent++;
    }
    const props=PropertiesService.getScriptProperties();
    const cursor=Math.max(2,Number(props.getProperty('TELEGRAM_MIGRATE_ROW')) || 2);
    const stop=Math.min(last,cursor+49);
    for(let row=cursor;row<=stop && Date.now()-started<45000;row++){
      if(!sheet.getRange(row,5).getValue()){
        const t=readTransaction_(sheet,row);
        sheet.getRange(row,5).setValue(t.data.kind==='order' && t.data.notifyAsync && t.status!=='RolledBack' ? 'Pending' : 'Skipped');
      }
      props.setProperty('TELEGRAM_MIGRATE_ROW',String(row+1));
    }
  } finally { lock.releaseLock(); }
}

// Client amounts are consent only; inventory and all charged amounts come from Sheets.
function sameCheckoutQuote_(expected,actual) {
  if (!expected || !Array.isArray(expected.items)) return false;
  const amounts=['subtotal','discount','deliveryCharge','codCharge','correctedTotal'];
  if (amounts.some(k=>typeof expected[k]!=='number' || !Number.isFinite(expected[k]) || expected[k]!==actual[k])) return false;
  const normalize=items=>items.map(x=>({id:String(x.id),size:String(x.size || ''),qty:x.qty,unitPrice:x.unitPrice,lineTotal:x.lineTotal})).sort((a,b)=>a.id.localeCompare(b.id)||a.size.localeCompare(b.size));
  return JSON.stringify(normalize(expected.items))===JSON.stringify(normalize(actual.items));
}

function getTelegramHealth_(){
  const props=PropertiesService.getScriptProperties();
  const result={lastRun:Number(props.getProperty('TELEGRAM_LAST_RUN'))||0,lastSuccess:Number(props.getProperty('TELEGRAM_LAST_SUCCESS'))||0,pending:0};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
  if(sheet && sheet.getLastRow()>1 && sheet.getLastColumn()>=5)result.pending=sheet.getRange(2,5,sheet.getLastRow()-1,1).createTextFinder('Pending').matchEntireCell(true).findAll().length;
  return result;
}


/* Admin workspace v7: staff permissions, paging, archive and payment. */
function authenticateAdmin_(key){
  const owner=secret_('ADMIN_KEY',ADMIN_KEY);
  if(owner && owner!=='change-this-secret-key' && key===owner)return {name:'Owner',role:'admin'};
  let staff=[];try{staff=JSON.parse(PropertiesService.getScriptProperties().getProperty('ADMIN_STAFF_JSON')||'[]');}catch(_){throw new Error('Staff configuration is invalid.');}
  const match=Array.isArray(staff)&&staff.find(x=>x.enabled!==false&&typeof x.key==='string'&&x.key.length>=24&&x.key===key&&['admin','editor','viewer'].includes(x.role));
  if(!match)throw new Error('unauthorized');
  return {name:String(match.name||'Staff').slice(0,60),role:match.role};
}
function assertAdminPermission_(actor,action){
  const reads=['adminSession','adminProducts','adminProductsPage','adminOrders','adminDashboard'];
  const edits=['add','update','archiveProduct','updateOrderStatus'];
  if(actor.role==='admin'||reads.includes(action)||(actor.role==='editor'&&edits.includes(action)))return;
  throw new Error('Your staff role does not allow this action.');
}
function dispatchAdmin_(body,actor){
  const action=String(body.action||'');assertAdminPermission_(actor,action);
  if(action==='adminSession')return {version:11,name:actor.name,role:actor.role};
  if(action==='adminProducts')return getAllProducts(true);
  if(action==='adminProductsPage')return adminProductsPage_(body.options||{});
  if(action==='adminOrders')return getAllOrders(body.options);
  if(action==='adminDashboard')return getDashboardData();
  if(action==='add')return addProduct(body.product||{},body.requestId);
  if(action==='update'){
    if(!body.product?.expected_revision && body.clientVersion>=7)throw new Error('Refresh and reopen the product before saving.');
    return updateProduct(body.product||{});
  }
  if(action==='delete')return deleteProduct(body.id,body.expected_revision);
  if(action==='archiveProduct')return archiveProduct_(body);
  if(action==='updateOrderStatus')return updateOrderStatus(body.orderId,body.status);
  if(action==='verifyPayment')return verifyPayment_(body,actor);
  throw new Error('unknown action');
}
function isArchived_(p){return String(p.archived||'').toLowerCase()==='yes';}
function productRevision_(p){
  return hashText_(JSON.stringify(['id','name','namehindi','category','subcategory','price','mrp','costprice','image','images','description','stock','stockqty','tags','sizes','sizeprices','archived'].map(k=>String(p[k]??''))));
}
function adminProductsPage_(options){
  const all=getAllProducts(true),q=String(options.query||'').trim().toLowerCase().slice(0,120),category=String(options.category||''),stock=String(options.stock||'all');
  let list=all.filter(p=>isArchived_(p)===(options.archived===true)&&(!category||p.category===category)&&(!q||[p.id,p.name,p.namehindi,p.category,p.subcategory,p.tags].join(' ').toLowerCase().includes(q)));
  list=list.filter(p=>{const tracked=p.stockqty!==''&&p.stockqty!==undefined&&p.stockqty!==null,out=p.stock==='out of stock'||(tracked&&Number(p.stockqty)<=0);return stock==='all'||(stock==='out'?out:stock==='low'?tracked&&Number(p.stockqty)>0&&Number(p.stockqty)<=5:!out);});
  const sort=options.sort||'id-asc';
  const compareId=(a,b)=>String(a.id||'').localeCompare(String(b.id||''),'en',{numeric:true,sensitivity:'base'})||String(a.id||'').localeCompare(String(b.id||''),'en');
  list.sort((a,b)=>sort==='id-asc'?compareId(a,b):sort==='id-desc'?compareId(b,a):(options.sort==='price-asc'?Number(a.price)-Number(b.price):options.sort==='price-desc'?Number(b.price)-Number(a.price):String(a.name||'').localeCompare(String(b.name||'')))||compareId(a,b));
  const total=list.length,page=Math.min(Math.max(0,Math.floor(Number(options.page)||0)),Math.max(0,Math.ceil(total/40)-1));
  return {products:list.slice(page*40,(page+1)*40).map(p=>({...p,_revision:productRevision_(p)})),page,total,allCount:all.filter(p=>isArchived_(p)===(options.archived===true)).length,categories:[...new Set(all.filter(p=>isArchived_(p)===(options.archived===true)).map(p=>p.category).filter(Boolean))].sort()};
}
function archiveProduct_(body){
  return withWriteLock_(function(){
    const sheet=getSheet_(PRODUCTS_SHEET);ensureColumn_(sheet,'archived');
    const heads=headers_(sheet),row=findRow_(sheet,'id',String(body.id||''));if(!row)throw new Error('Product not found.');
    const p={};sheet.getRange(row,1,1,heads.length).getValues()[0].forEach((v,i)=>p[heads[i]]=v);
    const desired=body.archived===true;
    if(isArchived_(p)===desired)return {success:true,id:body.id};
    if(!body.expected_revision||productRevision_(p)!==body.expected_revision)throw new Error('Product changed. Refresh before archiving or restoring.');
    sheet.getRange(row,heads.indexOf('archived')+1).setValue(desired?'yes':'');invalidatePublicCaches_();return {success:true,id:body.id};
  });
}
function verifyPayment_(body,actor){
  return withWriteLock_(function(){
    const state=String(body.paymentStatus||''),reference=String(body.reference||'').trim();
    if(!['Unverified','Received','Refunded'].includes(state)||reference.length>120)throw new Error('Invalid payment details.');
    if(state!=='Unverified'&&!reference)throw new Error('Enter a transaction reference or verification note.');
    const sheet=getSheet_(ORDERS_SHEET);['paymentstatus','paymentreference','paymentverifiedby','paymentverifiedat'].forEach(k=>ensureColumn_(sheet,k));
    const heads=headers_(sheet),row=findRow_(sheet,'orderid',String(body.orderId||''));if(!row)throw new Error('Order not found.');
    const current=sheet.getRange(row,heads.indexOf('paymentverifiedat')+1).getValue();
    if((current instanceof Date?current.toISOString():String(current||''))!==String(body.expectedVerifiedAt||''))throw new Error('Payment details changed. Refresh orders before verifying.');
    const record={paymentstatus:state,paymentreference:reference,paymentverifiedby:actor.name,paymentverifiedat:new Date().toISOString()};
    Object.keys(record).forEach(k=>sheet.getRange(row,heads.indexOf(k)+1).setValue(sheetText_(record[k])));
    return {success:true};
  });
}
