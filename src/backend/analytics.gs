/* analytics responsibilities. Bundled into code.gs by scripts/build.mjs.
   Lightweight first-party analytics for the storefront. No names, phones,
   addresses, order IDs, raw search text or other customer-entered PII are stored. */
function analyticsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ANALYTICS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ANALYTICS_SHEET);
    sheet.appendRow(['date', 'visitor', 'session', 'event', 'path', 'productId', 'category', 'subcategory', 'value', 'source', 'device', 'detail']);
    try { sheet.hideSheet(); } catch (_) {}
  }
  return sheet;
}
function analyticsCleanText_(value, max) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 100);
}
function analyticsEventRow_(raw, visitorHash, sessionHash, now) {
  const allowed = ANALYTICS_EVENTS;
  const name = analyticsCleanText_(raw && raw.name, 40);
  if (allowed.indexOf(name) < 0) return null;
  const props = raw && typeof raw.props === 'object' && raw.props ? raw.props : {};
  let date = new Date(raw && raw.ts || now);
  if (isNaN(date.getTime()) || Math.abs(now.getTime() - date.getTime()) > 14 * 86400000) date = now;
  const numeric = value => {
    const n = Number(value);
    return isFinite(n) ? Math.max(-10000000, Math.min(10000000, n)) : '';
  };
  let value = '';
  if (name === 'order_completed') value = numeric(props.total);
  else if (name === 'search') value = numeric(props.results);
  else if (name === 'review_submitted') value = props.verified ? 1 : 0;
  else if (name === 'begin_checkout') value = numeric(props.items);
  const detail = name === 'filter_change'
    ? analyticsCleanText_(props.filter, 30) + ':' + analyticsCleanText_(props.value, 60)
    : name === 'add_to_cart'
      ? analyticsCleanText_(props.source, 40)
      : name === 'order_completed' || name === 'begin_checkout'
        ? analyticsCleanText_(props.payment, 40)
        : '';
  const safeText = (value, max) => sheetText_(analyticsCleanText_(value, max));
  return [
    date,
    visitorHash,
    sessionHash,
    name,
    safeText(props.path || raw.path, 160),
    safeText(props.productId, 80),
    safeText(props.category, 80),
    safeText(props.subcategory, 80),
    value,
    safeText(props.trafficSource || raw.trafficSource, 100),
    safeText(props.device || raw.device, 20),
    sheetText_(detail)
  ];
}
function recordAnalyticsBatch_(body) {
  const batch = Array.isArray(body.events) ? body.events.slice(0, ANALYTICS_BATCH_MAX) : [];
  if (!batch.length) return { success: true, accepted: 0 };
  const visitor = analyticsCleanText_(body.visitorId, 100);
  const session = analyticsCleanText_(body.sessionId, 100);
  if (!visitor || !session) return { success: false, code: 'validation_failed', error: 'Anonymous analytics session is missing.' };
  // Abuse protection is deliberately isolated from checkout/order locks. Analytics
  // may be dropped under load; it must never make buying slower or less reliable.
  try { rateLimit_('analytics:' + visitor, 60, 60); } catch (_) { return { success: true, accepted: 0, throttled: true }; }
  const visitorHash = hashText_('visitor:' + visitor).slice(0, 32);
  const sessionHash = hashText_('session:' + session).slice(0, 32);
  const now = new Date();
  const rows = batch.map(item => analyticsEventRow_(item, visitorHash, sessionHash, now)).filter(Boolean);
  if (!rows.length) return { success: true, accepted: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) return { success: true, accepted: 0, busy: true };
  try {
    const sheet = analyticsSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { success: true, accepted: rows.length };
}
function analyticsDateKey_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}
function analyticsMetricSet_() {
  return { visitors: 0, sessions: 0, pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, orders: 0, revenue: 0, cancelled: 0 };
}
function analyticsPct_(value, base) {
  return base > 0 ? roundMoney_(value * 100 / base) : 0;
}
function analyticsDelta_(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.max(-999, Math.min(999, roundMoney_((current - previous) * 100 / previous)));
}
function analyticsInsight_(id, title, text, tone, focus) {
  return { id: id, title: title, text: text, tone: tone || 'neutral', focus: focus || 'visitors' };
}
function getAnalyticsReport_(options) {
  options = options || {};
  const daysRaw = Number(options.days) || 30;
  const days = [7, 30, 90].indexOf(daysRaw) >= 0 ? daysRaw : 30;
  const cacheKey = ANALYTICS_REPORT_CACHE_KEY + ':' + days;
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const currentStart = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(now.getTime() - days * 2 * 86400000);
  const events = [];
  try {
    const sheet = analyticsSheet_();
    const rows = rowsAsObjects_(sheet);
    rows.forEach(row => {
      const date = new Date(row.date);
      if (!isNaN(date.getTime()) && date >= previousStart) events.push({ ...row, _date: date });
    });
  } catch (_) {}

  function period(start, end) {
    const m = analyticsMetricSet_();
    const visitors = {}, sessions = {};
    events.forEach(row => {
      if (row._date < start || row._date >= end) return;
      if (row.visitor) visitors[row.visitor] = true;
      if (row.session) sessions[row.session] = true;
      if (row.event === 'page_view') m.pageViews++;
      if (row.event === 'product_view') m.productViews++;
      if (row.event === 'add_to_cart') m.addToCarts++;
      if (row.event === 'begin_checkout') m.checkouts++;
    });
    m.visitors = Object.keys(visitors).length;
    m.sessions = Object.keys(sessions).length;
    return m;
  }
  const current = period(currentStart, new Date(now.getTime() + 1000));
  const previous = period(previousStart, currentStart);

  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  orders.forEach(order => {
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || date < previousStart) return;
    const target = date >= currentStart ? current : previous;
    const status = String(order.status || 'Pending');
    if (status === 'Cancelled') { target.cancelled++; return; }
    target.orders++;
    target.revenue += Math.max(0, safeNumber_(order.total, 0));
  });
  current.revenue = roundMoney_(current.revenue);
  previous.revenue = roundMoney_(previous.revenue);

  const metrics = {
    visitors: { value: current.visitors, delta: analyticsDelta_(current.visitors, previous.visitors) },
    sessions: { value: current.sessions, delta: analyticsDelta_(current.sessions, previous.sessions) },
    productViews: { value: current.productViews, delta: analyticsDelta_(current.productViews, previous.productViews) },
    addToCarts: { value: current.addToCarts, delta: analyticsDelta_(current.addToCarts, previous.addToCarts) },
    checkouts: { value: current.checkouts, delta: analyticsDelta_(current.checkouts, previous.checkouts) },
    orders: { value: current.orders, delta: analyticsDelta_(current.orders, previous.orders) },
    revenue: { value: current.revenue, delta: analyticsDelta_(current.revenue, previous.revenue) },
    conversion: { value: analyticsPct_(current.orders, current.visitors), delta: analyticsDelta_(analyticsPct_(current.orders, current.visitors), analyticsPct_(previous.orders, previous.visitors)) }
  };

  const seriesMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000);
    const key = analyticsDateKey_(date, tz);
    seriesMap[key] = { key: key, label: Utilities.formatDate(date, tz, days <= 7 ? 'EEE' : 'dd MMM'), visitors: {}, sessions: {}, pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, orders: 0, revenue: 0 };
  }
  events.forEach(row => {
    if (row._date < currentStart) return;
    const slot = seriesMap[analyticsDateKey_(row._date, tz)];
    if (!slot) return;
    if (row.visitor) slot.visitors[row.visitor] = true;
    if (row.session) slot.sessions[row.session] = true;
    if (row.event === 'page_view') slot.pageViews++;
    if (row.event === 'product_view') slot.productViews++;
    if (row.event === 'add_to_cart') slot.addToCarts++;
    if (row.event === 'begin_checkout') slot.checkouts++;
  });
  orders.forEach(order => {
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || date < currentStart || String(order.status || '') === 'Cancelled') return;
    const slot = seriesMap[analyticsDateKey_(date, tz)];
    if (!slot) return;
    slot.orders++;
    slot.revenue += Math.max(0, safeNumber_(order.total, 0));
  });
  const series = Object.keys(seriesMap).sort().map(key => {
    const x = seriesMap[key];
    return { key: x.key, label: x.label, visitors: Object.keys(x.visitors).length, sessions: Object.keys(x.sessions).length, pageViews: x.pageViews, productViews: x.productViews, addToCarts: x.addToCarts, checkouts: x.checkouts, orders: x.orders, revenue: roundMoney_(x.revenue) };
  });

  const sourceCounts = {}, deviceCounts = {}, pageCounts = {}, categoryCounts = {}, productStats = {};
  events.forEach(row => {
    if (row._date < currentStart) return;
    if (row.event === 'page_view') {
      const source = String(row.source || 'Direct'); sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      const device = String(row.device || 'Unknown'); deviceCounts[device] = (deviceCounts[device] || 0) + 1;
      const path = String(row.path || '/'); pageCounts[path] = (pageCounts[path] || 0) + 1;
    }
    if (row.event === 'product_view' && row.category) categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
    const id = String(row.productid || '').trim();
    if (!id) return;
    if (!productStats[id]) productStats[id] = { id: id, views: 0, adds: 0, sold: 0, revenue: 0 };
    if (row.event === 'product_view') productStats[id].views++;
    if (row.event === 'add_to_cart') productStats[id].adds++;
  });
  try {
    const cancelledOrderIds = {};
    orders.forEach(order => { if (String(order.status || '') === 'Cancelled') cancelledOrderIds[String(order.orderid || '').trim()] = true; });
    rowsAsObjects_(getSheet_(ORDER_ITEMS_SHEET)).forEach(item => {
      const date = new Date(item.date);
      if (isNaN(date.getTime()) || date < currentStart || cancelledOrderIds[String(item.orderid || '').trim()]) return;
      const id = String(item.productid || '').trim();
      if (!id) return;
      if (!productStats[id]) productStats[id] = { id: id, views: 0, adds: 0, sold: 0, revenue: 0 };
      const qty = Math.max(0, safeNumber_(item.qty, 0));
      productStats[id].sold += qty;
      productStats[id].revenue += Math.max(0, safeNumber_(item.linerevenue, safeNumber_(item.unitprice, 0) * qty));
    });
  } catch (_) {}
  const productNames = {};
  try { rowsAsObjects_(getSheet_(PRODUCTS_SHEET)).forEach(p => productNames[String(p.id || '')] = String(p.name || p.id || '')); } catch (_) {}
  const topProducts = Object.keys(productStats).map(id => {
    const p = productStats[id];
    return { id: id, name: productNames[id] || id, views: p.views, adds: p.adds, cartRate: analyticsPct_(p.adds, p.views), sold: p.sold, revenue: roundMoney_(p.revenue), score: p.views + p.adds * 3 + p.sold * 6 };
  }).sort((a, b) => b.score - a.score || b.revenue - a.revenue).slice(0, 12);
  const breakdown = map => Object.keys(map).map(name => ({ name: name, value: map[name] })).sort((a, b) => b.value - a.value).slice(0, 10);

  const funnel = [
    { key: 'productViews', label: 'Product views', value: current.productViews },
    { key: 'addToCarts', label: 'Added to cart', value: current.addToCarts },
    { key: 'checkouts', label: 'Checkout', value: current.checkouts },
    { key: 'orders', label: 'Orders', value: current.orders }
  ];
  const insights = [];
  const mobile = Number(deviceCounts.Mobile || 0), totalDevice = Object.values(deviceCounts).reduce((a, b) => a + b, 0);
  if (totalDevice && mobile / totalDevice >= .65) insights.push(analyticsInsight_('mobile-first', 'Mobile is your storefront', Math.round(mobile * 100 / totalDevice) + '% of tracked page views are on mobile.', 'info', 'visitors'));
  if (current.productViews >= 20 && analyticsPct_(current.addToCarts, current.productViews) < 8) insights.push(analyticsInsight_('product-interest', 'Views are not becoming carts', 'Only ' + analyticsPct_(current.addToCarts, current.productViews) + '% of product views became add-to-cart actions.', 'warn', 'addToCarts'));
  if (current.checkouts >= 5 && analyticsPct_(current.orders, current.checkouts) < 55) insights.push(analyticsInsight_('checkout-drop', 'Checkout drop-off is visible', analyticsPct_(current.orders, current.checkouts) + '% of checkout starts became non-cancelled orders.', 'warn', 'checkouts'));
  if (topProducts[0] && topProducts[0].views >= 8) insights.push(analyticsInsight_('top-interest', topProducts[0].name + ' is drawing attention', topProducts[0].views + ' views · ' + topProducts[0].adds + ' cart adds · ' + topProducts[0].sold + ' sold.', 'good', 'productViews'));
  const topSource = breakdown(sourceCounts)[0];
  if (topSource && topSource.value >= 3) insights.push(analyticsInsight_('top-source', topSource.name + ' is your top source', topSource.value + ' page views in this period came from this source.', 'good', 'visitors'));
  if (!insights.length) insights.push(analyticsInsight_('collecting', 'Analytics is collecting', 'Keep this running for a few days. Insights become more useful once real traffic builds up.', 'neutral', 'visitors'));

  const report = {
    generatedAt: now.toISOString(), days: days, metrics: metrics, series: series, funnel: funnel,
    rates: { productToCart: analyticsPct_(current.addToCarts, current.productViews), cartToCheckout: analyticsPct_(current.checkouts, current.addToCarts), checkoutToOrder: analyticsPct_(current.orders, current.checkouts), cancellationRate: analyticsPct_(current.cancelled, current.orders + current.cancelled) },
    sources: breakdown(sourceCounts), devices: breakdown(deviceCounts), pages: breakdown(pageCounts), categories: breakdown(categoryCounts), topProducts: topProducts, insights: insights
  };
  cachePutJson_(cacheKey, report, ANALYTICS_REPORT_CACHE_TTL);
  return report;
}
