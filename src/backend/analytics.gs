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
  const heads = ['date', 'visitor', 'session', 'event', 'path', 'productId', 'category', 'subcategory', 'value', 'source', 'device', 'detail', 'medium', 'campaign', 'content', 'landing', 'qid'];
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
    safeText(raw.landing, 160),
    safeText(raw.qid, 100)
  ];
}
function recordAnalyticsBatch_(body) {
  const batch = Array.isArray(body.events) ? body.events.slice(0, ANALYTICS_BATCH_MAX) : [];
  if (!batch.length) return { success: true, accepted: 0 };
  const fallbackVisitor = analyticsCleanText_(body.visitorId, 100);
  const fallbackSession = analyticsCleanText_(body.sessionId, 100);
  if (!fallbackVisitor || !fallbackSession) return { success: false, code: 'validation_failed', error: 'Anonymous analytics session is missing.' };
  try { rateLimit_('analytics:' + fallbackVisitor, 60, 60); } catch (_) { return { success: true, accepted: 0, throttled: true }; }

  const now = new Date();
  const candidates = batch.map(item => {
    const visitor = analyticsCleanText_(item && item.visitorId || fallbackVisitor, 100);
    const session = analyticsCleanText_(item && item.sessionId || fallbackSession, 100);
    if (!visitor || !session) return null;
    const visitorHash = hashText_('visitor:' + visitor).slice(0, 32);
    const sessionHash = hashText_('session:' + session).slice(0, 32);
    const row = analyticsEventRow_(item, visitorHash, sessionHash, now);
    if (!row) return null;
    const qid = analyticsCleanText_(item && item.qid, 100);
    return { qid: qid, cacheKey: qid ? 'aq:' + hashText_(visitorHash + ':' + qid).slice(0, 36) : '', row: row };
  }).filter(Boolean);
  if (!candidates.length) return { success: true, accepted: 0 };

  // Retry safety: qid is persisted with the event and mirrored in Script Cache.
  // Cache avoids almost all reads; a short tail check protects against cache eviction.
  const cache = CacheService.getScriptCache();
  const cacheKeys = candidates.map(x => x.cacheKey).filter(Boolean);
  let cached = {};
  try { if (cacheKeys.length) cached = cache.getAll(cacheKeys) || {}; } catch (_) {}
  let pending = candidates.filter(x => !x.cacheKey || !cached[x.cacheKey]);
  if (!pending.length) return { success: true, accepted: 0, duplicates: candidates.length };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) return { success: true, accepted: 0, busy: true };
  let accepted = 0;
  try {
    const sheet = analyticsSheet_();
    const lastRow = sheet.getLastRow();
    const qids = {};
    pending.forEach(x => { if (x.qid) qids[x.qid] = true; });
    if (lastRow > 1 && Object.keys(qids).length) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(x => String(x || '').trim().toLowerCase());
      const qidCol = headers.indexOf('qid') + 1;
      if (qidCol > 0) {
        const take = Math.min(1500, lastRow - 1);
        sheet.getRange(lastRow - take + 1, qidCol, take, 1).getValues().forEach(r => {
          const qid = analyticsCleanText_(r[0], 100);
          if (qid) qids[qid] = qids[qid] === true ? 'seen' : qids[qid];
        });
        pending = pending.filter(x => !x.qid || qids[x.qid] !== 'seen');
      }
    }
    if (pending.length) {
      const rows = pending.map(x => x.row);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      accepted = rows.length;
      invalidateAnalyticsCaches_();
      const put = {};
      pending.forEach(x => { if (x.cacheKey) put[x.cacheKey] = '1'; });
      try { if (Object.keys(put).length) cache.putAll(put, 21600); } catch (_) {}
    }
  } finally {
    lock.releaseLock();
  }
  return { success: true, accepted: accepted, duplicates: candidates.length - accepted };
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
    // Keep anonymous identity sets internally so authoritative order rows can
    // repair a browser event that was lost after checkout succeeded.
    m._convertedVisitors = convertedVisitors;
    m._orderSessions = orderSessions;
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
    const trackedVisitor = String(order.analyticsvisitor || '').trim();
    const trackedSession = String(order.analyticssession || '').trim();
    if (trackedVisitor && target._convertedVisitors) target._convertedVisitors[trackedVisitor] = true;
    if (trackedSession && target._orderSessions) target._orderSessions[trackedSession] = true;
    if (COMPLETED_STATUSES.indexOf(status) >= 0) {
      target.deliveredOrders++;
      target.deliveredRevenue += total;
    }
  });
  [current, previous].forEach(target => {
    target.convertedVisitors = Object.keys(target._convertedVisitors || {}).length;
    target.orderSessions = Object.keys(target._orderSessions || {}).length;
    delete target._convertedVisitors;
    delete target._orderSessions;
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

  // A delta is only meaningful after analytics covers the full previous period.
  // Until then the admin shows "Not enough history" rather than a misleading +100%.
  const comparisonAvailable = !!trackingStart && trackingStart <= previousStart;
  const delta = (a, b) => comparisonAvailable ? analyticsDelta_(a, b) : null;
  const metrics = {
    visitors: { value: current.visitors, delta: delta(current.visitors, previous.visitors) },
    sessions: { value: current.sessions, delta: delta(current.sessions, previous.sessions) },
    productViews: { value: current.productViews, delta: delta(current.productViews, previous.productViews) },
    addToCarts: { value: current.addToCarts, delta: delta(current.addToCarts, previous.addToCarts) },
    checkouts: { value: current.checkouts, delta: delta(current.checkouts, previous.checkouts) },
    orders: { value: current.orders, delta: delta(current.orders, previous.orders) },
    deliveredOrders: { value: current.deliveredOrders, delta: delta(current.deliveredOrders, previous.deliveredOrders) },
    revenue: { value: current.revenue, delta: delta(current.revenue, previous.revenue) },
    deliveredRevenue: { value: current.deliveredRevenue, delta: delta(current.deliveredRevenue, previous.deliveredRevenue) },
    aov: { value: currentAov, delta: delta(currentAov, previousAov) },
    conversion: { value: analyticsPct_(current.convertedVisitors, current.visitors), delta: delta(analyticsPct_(current.convertedVisitors, current.visitors), analyticsPct_(previous.convertedVisitors, previous.visitors)) },
    cancellationRate: { value: currentCancellationRate, delta: comparisonAvailable ? currentCancellationRate - previousCancellationRate : null },
    deliveryRate: { value: currentDeliveryRate, delta: comparisonAvailable ? currentDeliveryRate - previousDeliveryRate : null }
  };

  const seriesMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000);
    const key = analyticsDateKey_(date, tz);
    seriesMap[key] = {
      key: key, label: Utilities.formatDate(date, tz, days <= 7 ? 'EEE' : 'dd MMM'),
      visitors: {}, sessions: {}, convertedVisitors: {}, productViewSessions: {}, cartSessions: {}, checkoutSessions: {}, orderSessions: {},
      pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, orders: 0, deliveredOrders: 0, revenue: 0, deliveredRevenue: 0
    };
  }
  events.forEach(row => {
    if (row._date < currentStart) return;
    const slot = seriesMap[analyticsDateKey_(row._date, tz)];
    if (!slot) return;
    if (row.visitor) slot.visitors[row.visitor] = true;
    if (row.session) slot.sessions[row.session] = true;
    if (row.event === 'page_view') slot.pageViews++;
    if (row.event === 'product_view') { slot.productViews++; if (row.session) slot.productViewSessions[row.session] = true; }
    if (row.event === 'add_to_cart') { slot.addToCarts++; if (row.session) slot.cartSessions[row.session] = true; }
    if (row.event === 'begin_checkout') { slot.checkouts++; if (row.session) slot.checkoutSessions[row.session] = true; }
    if (row.event === 'order_completed') {
      if (row.visitor) slot.convertedVisitors[row.visitor] = true;
      if (row.session) slot.orderSessions[row.session] = true;
    }
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
    const trackedVisitor = String(order.analyticsvisitor || '').trim();
    const trackedSession = String(order.analyticssession || '').trim();
    if (trackedVisitor) slot.convertedVisitors[trackedVisitor] = true;
    if (trackedSession) slot.orderSessions[trackedSession] = true;
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
      productViewSessions: Object.keys(x.productViewSessions).length, cartSessions: Object.keys(x.cartSessions).length,
      checkoutSessions: Object.keys(x.checkoutSessions).length, orderSessions: Object.keys(x.orderSessions).length,
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

  // Prefer authoritative order rows for order attribution when the checkout was
  // created by analytics v3. Browser order_completed remains a fallback for older orders.
  const attributedOrders = {};
  orders.forEach(order => {
    const date = new Date(order.date);
    const status = String(order.status || 'Pending');
    const session = String(order.analyticssession || '').trim();
    if (!session || isNaN(date.getTime()) || date < currentOrderStart || date > now || status === 'Cancelled') return;
    const a = attributedOrders[session] || (attributedOrders[session] = {
      orderValue: 0, source: String(order.analyticssource || 'Direct'), medium: String(order.analyticsmedium || ''),
      campaign: String(order.analyticscampaign || ''), content: String(order.analyticscontent || ''),
      landing: String(order.analyticslanding || '/'), first: date
    });
    a.orderValue += Math.max(0, safeNumber_(order.total, 0));
    if (date < a.first) a.first = date;
  });
  Object.keys(attributedOrders).forEach(session => {
    const a = attributedOrders[session];
    const state = sessionState[session] || (sessionState[session] = {
      first: a.first, source: a.source, medium: a.medium, campaign: a.campaign, content: a.content,
      landing: a.landing, device: 'Unknown', cart: false, checkout: false, order: false, orderValue: 0
    });
    if (!state.source || state.source === 'Direct') state.source = a.source || state.source;
    if (!state.medium) state.medium = a.medium;
    if (!state.campaign) state.campaign = a.campaign;
    if (!state.content) state.content = a.content;
    if (!state.landing) state.landing = a.landing;
    state.order = true;
    state.orderValue = roundMoney_(a.orderValue);
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
      const key = [s.source || 'Direct', s.medium || 'unknown', s.campaign, s.content || ''].filter(Boolean).join(' / ');
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
    const cartRate = analyticsPct_(viewerAdds, viewers.length);
    let opportunityLabel = 'Collecting data', opportunityScore = p.views + p.sold * 10;
    if (viewers.length >= 3 && cartRate < 15) {
      opportunityLabel = 'Improve conversion';
      opportunityScore = 1000 + viewers.length * (100 - cartRate);
    } else if (viewers.length > 0 && viewers.length < 5 && cartRate >= 25) {
      opportunityLabel = 'Promote more';
      opportunityScore = 700 + cartRate * 2;
    } else if (p.sold > 0) {
      opportunityLabel = 'Selling';
      opportunityScore = 500 + p.sold * 20 + p.revenue / 100;
    }
    return {
      id: id, name: productNames[id] || id, views: p.views, uniqueViewers: viewers.length, adds: p.adds,
      cartRate: cartRate, sold: p.sold, revenue: roundMoney_(p.revenue),
      revenuePerViewer: viewers.length ? roundMoney_(p.revenue / viewers.length) : 0,
      opportunityLabel: opportunityLabel, opportunityScore: roundMoney_(opportunityScore)
    };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore || b.views - a.views).slice(0, 20);

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
    { key: 'funnelProduct', label: 'Viewed products', value: current.productViewSessions },
    { key: 'funnelCart', label: 'Cart sessions', value: current.cartSessions },
    { key: 'funnelCheckout', label: 'Checkout sessions', value: current.checkoutSessions },
    { key: 'funnelOrder', label: 'Tracked order sessions', value: current.orderSessions }
  ];

  const insights = [];
  const mobile = Number(deviceCounts.Mobile || 0), totalDevice = Object.values(deviceCounts).reduce((a, b) => a + b, 0);
  if (totalDevice && mobile / totalDevice >= .65) insights.push(analyticsInsight_('mobile-first', 'Mobile is your storefront', Math.round(mobile * 100 / totalDevice) + '% of tracked sessions are on mobile.', 'info', 'visitors'));
  if (current.productViewSessions >= 20 && analyticsPct_(current.cartSessions, current.productViewSessions) < 12) insights.push(analyticsInsight_('product-interest', 'Product interest is not becoming carts', analyticsPct_(current.cartSessions, current.productViewSessions) + '% of product-view sessions reached the cart.', 'warn', 'funnelCart'));
  if (current.checkoutSessions >= 5 && analyticsPct_(current.orderSessions, current.checkoutSessions) < 55) insights.push(analyticsInsight_('checkout-drop', 'Checkout drop-off is visible', analyticsPct_(current.orderSessions, current.checkoutSessions) + '% of checkout sessions became orders.', 'warn', 'funnelCheckout'));
  if (current.searches >= 10 && current.zeroResultSearches > 0) insights.push(analyticsInsight_('search-gaps', 'Some searches return no products', current.zeroResultSearches + ' of ' + current.searches + ' tracked searches returned zero results.', 'info', 'productViews'));
  if (current.orders >= 5 && currentCancellationRate >= 15) insights.push(analyticsInsight_('cancellations', 'Cancellation rate needs attention', currentCancellationRate + '% of orders in this period were cancelled.', 'warn', 'orders'));
  const topViewed = topProducts.slice().sort((a, b) => b.views - a.views)[0];
  if (topViewed && topViewed.views >= 8) insights.push(analyticsInsight_('top-interest', topViewed.name + ' is drawing attention', topViewed.views + ' views · ' + topViewed.adds + ' cart adds · ' + topViewed.sold + ' delivered units.', 'good', 'productViews'));
  const topSource = analyticsBreakdown_(sourceCounts)[0];
  if (topSource && topSource.value >= 3) insights.push(analyticsInsight_('top-source', topSource.name + ' is your top source', topSource.value + ' sessions in this period came from this source.', 'good', 'visitors'));
  if (!insights.length) insights.push(analyticsInsight_('collecting', 'Analytics is collecting', 'Keep this running for a few days. Insights become more useful once real traffic builds up.', 'neutral', 'visitors'));

  const report = {
    generatedAt: now.toISOString(), days: days, trackingSince: trackingStart ? trackingStart.toISOString() : '', comparisonAvailable: comparisonAvailable,
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
