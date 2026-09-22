/* analytics responsibilities. Bundled into code.gs by scripts/build.mjs.
   Lightweight first-party analytics for the storefront. No names, phones,
   addresses, order IDs, raw search text or other customer-entered PII are stored.

   Architecture notes:
   - Store only compact decision events; do not track scroll/hover noise.
   - Attribution is session-scoped and intentionally limited to UTM metadata.
   - Orders/real revenue come from authoritative order sheets, not browser events.
   - Analytics writes are best-effort and isolated from checkout locks.
*/
function analyticsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ANALYTICS_SHEET);
  const heads = ['date', 'visitor', 'session', 'event', 'path', 'productId', 'category', 'subcategory', 'value', 'source', 'device', 'detail', 'medium', 'campaign', 'content', 'landing'];
  if (!sheet) {
    sheet = ss.insertSheet(ANALYTICS_SHEET);
    sheet.appendRow(heads);
    try { sheet.hideSheet(); } catch (_) {}
  } else {
    heads.forEach(name => ensureColumn_(sheet, name));
  }
  return sheet;
}
function analyticsCleanText_(value, max) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 100);
}
function analyticsEventRow_(raw, visitorHash, sessionHash, now) {
  const name = analyticsCleanText_(raw && raw.name, 40);
  if (ANALYTICS_EVENTS.indexOf(name) < 0) return null;
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
    sheetText_(detail),
    safeText(raw.trafficMedium, 60),
    safeText(raw.trafficCampaign, 100),
    safeText(raw.trafficContent, 100),
    safeText(raw.landing, 160)
  ];
}
function recordAnalyticsBatch_(body) {
  const batch = Array.isArray(body.events) ? body.events.slice(0, ANALYTICS_BATCH_MAX) : [];
  if (!batch.length) return { success: true, accepted: 0 };
  const visitor = analyticsCleanText_(body.visitorId, 100);
  const session = analyticsCleanText_(body.sessionId, 100);
  if (!visitor || !session) return { success: false, code: 'validation_failed', error: 'Anonymous analytics session is missing.' };
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
    invalidateAnalyticsCaches_();
  } finally {
    lock.releaseLock();
  }
  return { success: true, accepted: rows.length };
}
function analyticsDateKey_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}
function analyticsMetricSet_() {
  return {
    visitors: 0, sessions: 0, pageViews: 0, productViews: 0, productViewSessions: 0,
    addToCarts: 0, checkouts: 0, orders: 0, revenue: 0, deliveredOrders: 0,
    deliveredRevenue: 0, cancelled: 0, searches: 0, zeroResultSearches: 0
  };
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
function analyticsBreakdown_(map, limit) {
  return Object.keys(map).map(name => ({ name: name, value: map[name] })).sort((a, b) => b.value - a.value).slice(0, limit || 10);
}
function getAnalyticsReport_(options) {
  options = options || {};
  const daysRaw = Number(options.days) || 30;
  const days = [7, 30, 90].indexOf(daysRaw) >= 0 ? daysRaw : 30;
  const cacheKey = ANALYTICS_REPORT_CACHE_KEY + ':' + days;
  const cached = options.force ? null : cacheGetJson_(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const currentStart = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(now.getTime() - days * 2 * 86400000);
  const events = [];
  let trackingStart = null;
  try {
    rowsAsObjects_(analyticsSheet_()).forEach(row => {
      const date = new Date(row.date);
      if (isNaN(date.getTime())) return;
      if (!trackingStart || date < trackingStart) trackingStart = date;
      if (date >= previousStart) events.push({ ...row, _date: date });
    });
  } catch (_) {}

  // Browser analytics only exists from trackingStart. Keep order comparisons inside
  // the same coverage window so conversion/revenue comparisons remain honest.
  const currentOrderStart = trackingStart && trackingStart > currentStart ? trackingStart : currentStart;
  const previousOrderStart = trackingStart && trackingStart > previousStart ? trackingStart : previousStart;

  function period(start, end) {
    const m = analyticsMetricSet_();
    const visitors = {}, sessions = {}, productViewSessions = {}, convertedVisitors = {}, cartSessions = {}, checkoutSessions = {}, orderSessions = {};
    events.forEach(row => {
      if (row._date < start || row._date >= end) return;
      if (row.visitor) visitors[row.visitor] = true;
      if (row.session) sessions[row.session] = true;
      if (row.event === 'page_view') m.pageViews++;
      if (row.event === 'product_view') {
        m.productViews++;
        if (row.session) productViewSessions[row.session] = true;
      }
      if (row.event === 'search') {
        m.searches++;
        if (Number(row.value) === 0) m.zeroResultSearches++;
      }
      if (row.event === 'add_to_cart') {
        m.addToCarts++;
        if (row.session) cartSessions[row.session] = true;
      }
      if (row.event === 'begin_checkout') {
        m.checkouts++;
        if (row.session) checkoutSessions[row.session] = true;
      }
      if (row.event === 'order_completed') {
        if (row.visitor) convertedVisitors[row.visitor] = true;
        if (row.session) orderSessions[row.session] = true;
      }
    });
    m.visitors = Object.keys(visitors).length;
    m.sessions = Object.keys(sessions).length;
    m.productViewSessions = Object.keys(productViewSessions).length;
    m.convertedVisitors = Object.keys(convertedVisitors).length;
    m.cartSessions = Object.keys(cartSessions).length;
    m.checkoutSessions = Object.keys(checkoutSessions).length;
    m.orderSessions = Object.keys(orderSessions).length;
    return m;
  }

  const current = period(currentStart, new Date(now.getTime() + 1000));
  const previous = period(previousStart, currentStart);
  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));

  orders.forEach(order => {
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || !trackingStart || date < previousOrderStart || date > now) return;
    let target = null;
    if (date >= currentStart && date >= currentOrderStart) target = current;
    else if (date < currentStart && date >= previousOrderStart) target = previous;
    if (!target) return;
    const status = String(order.status || 'Pending');
    const total = Math.max(0, safeNumber_(order.total, 0));
    if (status === 'Cancelled') { target.cancelled++; return; }
    target.orders++;
    target.revenue += total;
    if (COMPLETED_STATUSES.indexOf(status) >= 0) {
      target.deliveredOrders++;
      target.deliveredRevenue += total;
    }
  });
  ['revenue', 'deliveredRevenue'].forEach(key => {
    current[key] = roundMoney_(current[key]);
    previous[key] = roundMoney_(previous[key]);
  });

  const currentAov = current.orders ? roundMoney_(current.revenue / current.orders) : 0;
  const previousAov = previous.orders ? roundMoney_(previous.revenue / previous.orders) : 0;
  const currentCancellationRate = analyticsPct_(current.cancelled, current.orders + current.cancelled);
  const previousCancellationRate = analyticsPct_(previous.cancelled, previous.orders + previous.cancelled);
  const currentDeliveryRate = analyticsPct_(current.deliveredOrders, current.orders);
  const previousDeliveryRate = analyticsPct_(previous.deliveredOrders, previous.orders);

  const metrics = {
    visitors: { value: current.visitors, delta: analyticsDelta_(current.visitors, previous.visitors) },
    sessions: { value: current.sessions, delta: analyticsDelta_(current.sessions, previous.sessions) },
    productViews: { value: current.productViews, delta: analyticsDelta_(current.productViews, previous.productViews) },
    addToCarts: { value: current.addToCarts, delta: analyticsDelta_(current.addToCarts, previous.addToCarts) },
    checkouts: { value: current.checkouts, delta: analyticsDelta_(current.checkouts, previous.checkouts) },
    orders: { value: current.orders, delta: analyticsDelta_(current.orders, previous.orders) },
    deliveredOrders: { value: current.deliveredOrders, delta: analyticsDelta_(current.deliveredOrders, previous.deliveredOrders) },
    revenue: { value: current.revenue, delta: analyticsDelta_(current.revenue, previous.revenue) },
    deliveredRevenue: { value: current.deliveredRevenue, delta: analyticsDelta_(current.deliveredRevenue, previous.deliveredRevenue) },
    aov: { value: currentAov, delta: analyticsDelta_(currentAov, previousAov) },
    conversion: { value: analyticsPct_(current.convertedVisitors, current.visitors), delta: analyticsDelta_(analyticsPct_(current.convertedVisitors, current.visitors), analyticsPct_(previous.convertedVisitors, previous.visitors)) },
    cancellationRate: { value: currentCancellationRate, delta: currentCancellationRate - previousCancellationRate },
    deliveryRate: { value: currentDeliveryRate, delta: currentDeliveryRate - previousDeliveryRate }
  };

  const seriesMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000);
    const key = analyticsDateKey_(date, tz);
    seriesMap[key] = {
      key: key, label: Utilities.formatDate(date, tz, days <= 7 ? 'EEE' : 'dd MMM'),
      visitors: {}, sessions: {}, convertedVisitors: {}, pageViews: 0, productViews: 0,
      addToCarts: 0, checkouts: 0, orders: 0, deliveredOrders: 0, revenue: 0, deliveredRevenue: 0
    };
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
    if (row.event === 'order_completed' && row.visitor) slot.convertedVisitors[row.visitor] = true;
  });
  orders.forEach(order => {
    const date = new Date(order.date);
    const status = String(order.status || '');
    if (isNaN(date.getTime()) || !trackingStart || date < currentOrderStart || date > now || status === 'Cancelled') return;
    const slot = seriesMap[analyticsDateKey_(date, tz)];
    if (!slot) return;
    const total = Math.max(0, safeNumber_(order.total, 0));
    slot.orders++;
    slot.revenue += total;
    if (COMPLETED_STATUSES.indexOf(status) >= 0) {
      slot.deliveredOrders++;
      slot.deliveredRevenue += total;
    }
  });
  const series = Object.keys(seriesMap).sort().map(key => {
    const x = seriesMap[key];
    return {
      key: x.key, label: x.label, visitors: Object.keys(x.visitors).length,
      sessions: Object.keys(x.sessions).length, convertedVisitors: Object.keys(x.convertedVisitors).length,
      pageViews: x.pageViews, productViews: x.productViews, addToCarts: x.addToCarts,
      checkouts: x.checkouts, orders: x.orders, deliveredOrders: x.deliveredOrders,
      revenue: roundMoney_(x.revenue), deliveredRevenue: roundMoney_(x.deliveredRevenue),
      aov: x.orders ? roundMoney_(x.revenue / x.orders) : 0
    };
  });

  // Session attribution and landing performance are derived once here instead of
  // generating extra browser events. This keeps Apps Script/Sheets load low.
  const sessionState = {}, pageCounts = {}, categoryCounts = {}, productStats = {};
  events.forEach(row => {
    if (row._date < currentStart) return;
    const session = String(row.session || '').trim();
    if (session) {
      const state = sessionState[session] || (sessionState[session] = {
        first: row._date, source: String(row.source || 'Direct'), medium: String(row.medium || ''),
        campaign: String(row.campaign || ''), content: String(row.content || ''),
        landing: String(row.landing || ''), device: String(row.device || 'Unknown'),
        cart: false, checkout: false, order: false, orderValue: 0
      });
      if (row._date < state.first) state.first = row._date;
      if (!state.landing && row.event === 'page_view') state.landing = String(row.path || '/');
      if (row.event === 'add_to_cart') state.cart = true;
      if (row.event === 'begin_checkout') state.checkout = true;
      if (row.event === 'order_completed') { state.order = true; state.orderValue += Math.max(0, safeNumber_(row.value, 0)); }
    }
    if (row.event === 'page_view') {
      const path = String(row.path || '/');
      pageCounts[path] = (pageCounts[path] || 0) + 1;
    }
    if (row.event === 'product_view' && row.category) categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
    const id = String(row.productid || '').trim();
    if (!id) return;
    if (!productStats[id]) productStats[id] = { id: id, views: 0, adds: 0, sold: 0, revenue: 0, viewVisitors: {}, addVisitors: {} };
    if (row.event === 'product_view') {
      productStats[id].views++;
      if (row.visitor) productStats[id].viewVisitors[row.visitor] = true;
    }
    if (row.event === 'add_to_cart') {
      productStats[id].adds++;
      if (row.visitor) productStats[id].addVisitors[row.visitor] = true;
    }
  });

  const sourceCounts = {}, deviceCounts = {}, campaignStats = {}, landingStats = {};
  Object.keys(sessionState).forEach(session => {
    const s = sessionState[session];
    sourceCounts[s.source || 'Direct'] = (sourceCounts[s.source || 'Direct'] || 0) + 1;
    deviceCounts[s.device || 'Unknown'] = (deviceCounts[s.device || 'Unknown'] || 0) + 1;
    const landing = s.landing || '/';
    const l = landingStats[landing] || (landingStats[landing] = { name: landing, sessions: 0, carts: 0, orders: 0, orderValue: 0 });
    l.sessions++;
    if (s.cart) l.carts++;
    if (s.order) { l.orders++; l.orderValue += s.orderValue; }
    if (s.campaign) {
      const key = [s.source || 'Direct', s.medium || 'unknown', s.campaign].join(' / ');
      const c = campaignStats[key] || (campaignStats[key] = { name: key, sessions: 0, orders: 0, orderValue: 0 });
      c.sessions++;
      if (s.order) { c.orders++; c.orderValue += s.orderValue; }
    }
  });

  // Product revenue in analytics means delivered/fulfilled revenue only. Pending
  // orders remain visible in the placed-order KPIs but do not inflate realised sales.
  try {
    const cancelledOrderIds = {}, completedOrderIds = {};
    orders.forEach(order => {
      const status = String(order.status || '');
      const id = String(order.orderid || '').trim();
      if (status === 'Cancelled') cancelledOrderIds[id] = true;
      if (COMPLETED_STATUSES.indexOf(status) >= 0) completedOrderIds[id] = true;
    });
    rowsAsObjects_(getSheet_(ORDER_ITEMS_SHEET)).forEach(item => {
      const date = new Date(item.date);
      const orderId = String(item.orderid || '').trim();
      if (isNaN(date.getTime()) || !trackingStart || date < currentOrderStart || date > now || cancelledOrderIds[orderId] || !completedOrderIds[orderId]) return;
      const id = String(item.productid || '').trim();
      if (!id) return;
      if (!productStats[id]) productStats[id] = { id: id, views: 0, adds: 0, sold: 0, revenue: 0, viewVisitors: {}, addVisitors: {} };
      const qty = Math.max(0, safeNumber_(item.qty, 0));
      productStats[id].sold += qty;
      productStats[id].revenue += Math.max(0, safeNumber_(item.linerevenue, safeNumber_(item.unitprice, 0) * qty));
    });
  } catch (_) {}

  const productNames = {};
  try { rowsAsObjects_(getSheet_(PRODUCTS_SHEET)).forEach(p => productNames[String(p.id || '')] = String(p.name || p.id || '')); } catch (_) {}
  const topProducts = Object.keys(productStats).map(id => {
    const p = productStats[id], viewers = Object.keys(p.viewVisitors || {}), adders = p.addVisitors || {};
    const viewerAdds = viewers.reduce((count, visitor) => count + (adders[visitor] ? 1 : 0), 0);
    return {
      id: id, name: productNames[id] || id, views: p.views, adds: p.adds,
      cartRate: analyticsPct_(viewerAdds, viewers.length), sold: p.sold,
      revenue: roundMoney_(p.revenue), revenuePerView: p.views ? roundMoney_(p.revenue / p.views) : 0,
      viewsPerSale: p.sold ? roundMoney_(p.views / p.sold) : 0,
      score: p.views + p.adds * 3 + p.sold * 6
    };
  }).sort((a, b) => b.score - a.score || b.revenue - a.revenue).slice(0, 12);

  const landingPages = Object.values(landingStats).map(x => ({
    name: x.name, sessions: x.sessions, carts: x.carts, orders: x.orders,
    orderValue: roundMoney_(x.orderValue), conversion: analyticsPct_(x.orders, x.sessions)
  })).sort((a, b) => b.sessions - a.sessions || b.orders - a.orders).slice(0, 10);
  const campaigns = Object.values(campaignStats).map(x => ({
    name: x.name, sessions: x.sessions, orders: x.orders,
    orderValue: roundMoney_(x.orderValue), conversion: analyticsPct_(x.orders, x.sessions)
  })).sort((a, b) => b.sessions - a.sessions || b.orders - a.orders).slice(0, 10);

  const funnel = [
    { key: 'sessions', label: 'Sessions', value: current.sessions },
    { key: 'productViews', label: 'Viewed products', value: current.productViewSessions },
    { key: 'addToCarts', label: 'Cart sessions', value: current.cartSessions },
    { key: 'checkouts', label: 'Checkout sessions', value: current.checkoutSessions },
    { key: 'conversion', label: 'Order sessions', value: current.orderSessions }
  ];

  const insights = [];
  const mobile = Number(deviceCounts.Mobile || 0), totalDevice = Object.values(deviceCounts).reduce((a, b) => a + b, 0);
  if (totalDevice && mobile / totalDevice >= .65) insights.push(analyticsInsight_('mobile-first', 'Mobile is your storefront', Math.round(mobile * 100 / totalDevice) + '% of tracked sessions are on mobile.', 'info', 'visitors'));
  if (current.productViewSessions >= 20 && analyticsPct_(current.cartSessions, current.productViewSessions) < 12) insights.push(analyticsInsight_('product-interest', 'Product interest is not becoming carts', analyticsPct_(current.cartSessions, current.productViewSessions) + '% of product-view sessions reached the cart.', 'warn', 'addToCarts'));
  if (current.checkoutSessions >= 5 && analyticsPct_(current.orderSessions, current.checkoutSessions) < 55) insights.push(analyticsInsight_('checkout-drop', 'Checkout drop-off is visible', analyticsPct_(current.orderSessions, current.checkoutSessions) + '% of checkout sessions became orders.', 'warn', 'checkouts'));
  if (current.searches >= 10 && current.zeroResultSearches > 0) insights.push(analyticsInsight_('search-gaps', 'Some searches return no products', current.zeroResultSearches + ' of ' + current.searches + ' tracked searches returned zero results.', 'info', 'productViews'));
  if (current.orders >= 5 && currentCancellationRate >= 15) insights.push(analyticsInsight_('cancellations', 'Cancellation rate needs attention', currentCancellationRate + '% of orders in this period were cancelled.', 'warn', 'orders'));
  if (topProducts[0] && topProducts[0].views >= 8) insights.push(analyticsInsight_('top-interest', topProducts[0].name + ' is drawing attention', topProducts[0].views + ' views · ' + topProducts[0].adds + ' cart adds · ' + topProducts[0].sold + ' delivered units.', 'good', 'productViews'));
  const topSource = analyticsBreakdown_(sourceCounts)[0];
  if (topSource && topSource.value >= 3) insights.push(analyticsInsight_('top-source', topSource.name + ' is your top source', topSource.value + ' sessions in this period came from this source.', 'good', 'visitors'));
  if (!insights.length) insights.push(analyticsInsight_('collecting', 'Analytics is collecting', 'Keep this running for a few days. Insights become more useful once real traffic builds up.', 'neutral', 'visitors'));

  const report = {
    generatedAt: now.toISOString(), days: days, trackingSince: trackingStart ? trackingStart.toISOString() : '',
    metrics: metrics, series: series, funnel: funnel,
    rates: {
      sessionToProduct: analyticsPct_(current.productViewSessions, current.sessions),
      productToCart: analyticsPct_(current.cartSessions, current.productViewSessions),
      sessionToCart: analyticsPct_(current.cartSessions, current.sessions),
      cartToCheckout: analyticsPct_(current.checkoutSessions, current.cartSessions),
      checkoutToOrder: analyticsPct_(current.orderSessions, current.checkoutSessions),
      cancellationRate: currentCancellationRate,
      deliveryRate: currentDeliveryRate
    },
    searches: { total: current.searches, zeroResults: current.zeroResultSearches, zeroResultRate: analyticsPct_(current.zeroResultSearches, current.searches) },
    sources: analyticsBreakdown_(sourceCounts), devices: analyticsBreakdown_(deviceCounts), pages: analyticsBreakdown_(pageCounts),
    categories: analyticsBreakdown_(categoryCounts), campaigns: campaigns, landingPages: landingPages,
    topProducts: topProducts, insights: insights
  };
  cachePutJson_(cacheKey, report, ANALYTICS_REPORT_CACHE_TTL);
  return report;
}
