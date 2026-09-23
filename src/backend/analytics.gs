/* analytics responsibilities. Bundled into code.gs by scripts/build.mjs.
   Lightweight first-party analytics for the storefront. No names, phones,
   addresses, order IDs, raw search text or other customer-entered PII are stored.

   Architecture notes:
   - Store only compact decision events; do not track scroll/hover noise.
   - Attribution is session-scoped and intentionally limited to UTM metadata.
   - Orders/real revenue come from authoritative order sheets, not browser events.
   - Analytics writes are best-effort and share the script lock with checkout.
*/
const ANALYTICS_RESET_AT_PROPERTY = 'ANALYTICS_RESET_AT';

function analyticsResetAt_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ANALYTICS_RESET_AT_PROPERTY);
  const date = raw ? new Date(raw) : null;
  return date && !isNaN(date.getTime()) ? date : null;
}

function resetAnalytics_(actor) {
  if (!actor || actor.role !== 'admin') throw new Error('Only the owner/admin can reset analytics.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Analytics is busy. Please try again in a moment.');
  try {
    const resetAt = new Date();
    const sheet = analyticsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    PropertiesService.getScriptProperties().setProperty(ANALYTICS_RESET_AT_PROPERTY, resetAt.toISOString());
    invalidateAnalyticsCaches_();
    return { success: true, resetAt: resetAt.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function analyticsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ANALYTICS_SHEET);
  const heads = ['date', 'visitor', 'session', 'event', 'path', 'productId', 'category', 'subcategory', 'value', 'source', 'device', 'detail', 'medium', 'campaign', 'content', 'landing', 'qid'];
  if (!sheet) {
    sheet = ss.insertSheet(ANALYTICS_SHEET);
    sheet.appendRow(heads);
    try { sheet.hideSheet(); } catch (_) {}
  } else {
    const existing = headers_(sheet);
    const missing = heads.filter(name => existing.indexOf(name.toLowerCase()) < 0);
    if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
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
  if (!raw || !raw.ts || !analyticsCleanText_(raw.qid, 100)) return null;
  let date = new Date(raw.ts);
  if (isNaN(date.getTime()) || now - date > 14 * 86400000 || date - now > 300000) return null;
  if (date > now) date = now;
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
  const resetAt = analyticsResetAt_();
  const candidates = batch.map(item => {
    // A reset is a hard data boundary. Ignore events that were queued before it
    // and arrived later after connectivity returned.
    if (resetAt && item && item.ts) {
      const eventDate = new Date(item.ts);
      if (!isNaN(eventDate.getTime()) && eventDate < resetAt) return null;
    }
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
  // Cache avoids repeat reads; durable lookup covers the whole active retention window.
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
    // Recheck reset under the same lock that protects reset and append.
    const boundary = analyticsResetAt_(), batchSeen = new Set();
    pending = pending.filter(x => {
      if (boundary && x.row[0] < boundary || batchSeen.has(x.qid)) return false;
      batchSeen.add(x.qid); return true;
    });
    try { rateLimit_('analytics-global-batches', 120, 60); }
    catch (_) { return { success: true, accepted: 0, throttled: true }; }
    const qids = {};
    pending.forEach(x => { qids[x.qid] = true; });
    if (lastRow > 1 && Object.keys(qids).length) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(x => String(x || '').trim().toLowerCase());
      const qidCol = headers.indexOf('qid') + 1;
      if (qidCol > 0) {
        const pattern = '^(?:' + Object.keys(qids).map(analyticsRegexEscape_).join('|') + ')$';
        sheet.getRange(2, qidCol, lastRow - 1, 1).createTextFinder(pattern).useRegularExpression(true).matchEntireCell(true).findAll().forEach(hit => {
          qids[String(hit.getValue())] = 'seen';
        });
        pending = pending.filter(x => !x.qid || qids[x.qid] !== 'seen');
      }
    }
    if (pending.length) {
      const canonical = ['date','visitor','session','event','path','productid','category','subcategory','value','source','device','detail','medium','campaign','content','landing','qid'];
      const heads = headers_(sheet);
      const rows = pending.map(x => heads.map(h => canonical.indexOf(h) >= 0 ? x.row[canonical.indexOf(h)] : ''));
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      accepted = rows.length;
      // Reports expire naturally; ingestion must not defeat the report cache.
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
// Calendar arithmetic is performed on date keys, then parsed in the shop timezone.
// This keeps local-midnight boundaries correct even across daylight-saving changes.
function analyticsDayOffset_(key, offset) {
  const date = new Date(key + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function analyticsOverlap_(left, right) {
  return Object.keys(left).reduce((count, key) => count + (right[key] ? 1 : 0), 0);
}
function getAnalyticsReport_(options) {
  options = options || {};
  const actualNow=new Date(), tz=Session.getScriptTimeZone();
  const window=analyticsWindow_(options,actualNow,tz);
  const days=window.days, now=window.end, today=window.lastDay, currentDay=window.firstDay;
  const cacheKey = ANALYTICS_REPORT_CACHE_KEY + ':' + days;
  const epoch = String(analyticsResetAt_() || '');
  const cached = options.force || window.custom ? null : cacheGetChunkedJson_(cacheKey);
  if (cached && cached.resetEpoch === epoch) return cached;
  const currentStart = Utilities.parseDate(currentDay, tz, 'yyyy-MM-dd');
  const previousStart = Utilities.parseDate(analyticsDayOffset_(currentDay, -days), tz, 'yyyy-MM-dd');
  const resetAt = analyticsResetAt_();
  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  const events = [];
  const firstSeen = PropertiesService.getScriptProperties().getProperty('ANALYTICS_FIRST_SEEN');
  let trackingStart = resetAt || (firstSeen && !isNaN(new Date(firstSeen)) ? new Date(firstSeen) : null);
  // An attributed order proves tracking existed even if all browser events were lost.
  orders.forEach(order => {
    if (resetAt || (!order.analyticsvisitor && !order.analyticssession)) return;
    const date = new Date(order.date);
    if (!isNaN(date.getTime()) && date <= now && (!trackingStart || date < trackingStart)) trackingStart = date;
  });
  try {
    rowsAsObjects_(analyticsSheet_()).forEach(row => {
      const date = new Date(row.date);
      if (isNaN(date.getTime()) || date > now || (resetAt && date < resetAt)) return;
      if (!trackingStart || (!resetAt && date < trackingStart)) trackingStart = date;
      if (date >= previousStart) events.push({ ...row, _date: date });
    });
  } catch (err) { throw new Error('Analytics data could not be read. Please retry.'); }

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
    m._visitors = visitors;
    m._sessions = sessions;
    m._productViewSessions = productViewSessions;
    m._cartSessions = cartSessions;
    m._checkoutSessions = checkoutSessions;
    return m;
  }

  const current = period(currentStart, new Date(now.getTime() + 1));
  const previous = period(previousStart, currentStart);
  orders.forEach(order => {
    const date = new Date(order.date);
    if (isNaN(date.getTime()) || !trackingStart || date < previousOrderStart || date > now) return;
    let target = null;
    if (date >= currentStart && date >= currentOrderStart) target = current;
    else if (date < currentStart && date >= previousOrderStart) target = previous;
    if (!target) return;
    const status = String(order.status || 'Pending');
    const total = Math.max(0, safeNumber_(order.total, 0));
    const trackedVisitor = String(order.analyticsvisitor || '').trim();
    const trackedSession = String(order.analyticssession || '').trim();
    // Recover both the denominator and outcome. Cancelled shoppers remain visitors.
    if (trackedVisitor) target._visitors[trackedVisitor] = true;
    if (trackedSession) target._sessions[trackedSession] = true;
    if (status === 'Cancelled') { target.cancelled++; return; }
    target.orders++;
    target.revenue += total;
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
    target.visitors = Object.keys(target._visitors).length;
    target.sessions = Object.keys(target._sessions).length;
    // These are same-period overlaps, not an assumed ordered funnel.
    target.productCartSessions = analyticsOverlap_(target._productViewSessions, target._cartSessions);
    target.cartCheckoutSessions = analyticsOverlap_(target._cartSessions, target._checkoutSessions);
    target.checkoutOrderSessions = analyticsOverlap_(target._checkoutSessions, target._orderSessions);
    ['_convertedVisitors','_orderSessions','_visitors','_sessions','_productViewSessions','_cartSessions','_checkoutSessions'].forEach(key => delete target[key]);
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
    const key = analyticsDayOffset_(today, -i);
    const date = Utilities.parseDate(key, tz, 'yyyy-MM-dd');
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
  });
  orders.forEach(order => {
    const date = new Date(order.date);
    const status = String(order.status || '');
    if (isNaN(date.getTime()) || !trackingStart || date < currentOrderStart || date > now) return;
    const slot = seriesMap[analyticsDateKey_(date, tz)];
    if (!slot) return;
    const total = Math.max(0, safeNumber_(order.total, 0));
    const trackedVisitor = String(order.analyticsvisitor || '').trim();
    const trackedSession = String(order.analyticssession || '').trim();
    if (trackedVisitor) slot.visitors[trackedVisitor] = true;
    if (trackedSession) slot.sessions[trackedSession] = true;
    if (status === 'Cancelled') return;
    slot.orders++;
    slot.revenue += total;
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

  // Only Orders can establish order counts, value and conversion. Legacy orders
  // without attribution still count in KPIs but cannot be assigned to a campaign.
  const attributedOrders = {};
  orders.forEach(order => {
    const date = new Date(order.date);
    const status = String(order.status || 'Pending');
    const session = String(order.analyticssession || '').trim();
    if (!session || !trackingStart || isNaN(date.getTime()) || date < currentOrderStart || date > now) return;
    const a = attributedOrders[session] || (attributedOrders[session] = {
      orders: 0, orderValue: 0, source: String(order.analyticssource || 'Direct'), medium: String(order.analyticsmedium || ''),
      campaign: String(order.analyticscampaign || ''), content: String(order.analyticscontent || ''),
      landing: String(order.analyticslanding || '/'), first: date
    });
    if (status !== 'Cancelled') {
      a.orders++;
      a.orderValue += Math.max(0, safeNumber_(order.total, 0));
    }
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
    state.orders = a.orders;
    state.order = a.orders > 0;
    state.orderValue = roundMoney_(a.orderValue);
  });

  const sourceCounts = {}, deviceCounts = {}, campaignStats = {}, landingStats = {};
  Object.keys(sessionState).forEach(session => {
    const s = sessionState[session];
    sourceCounts[s.source || 'Direct'] = (sourceCounts[s.source || 'Direct'] || 0) + 1;
    deviceCounts[s.device || 'Unknown'] = (deviceCounts[s.device || 'Unknown'] || 0) + 1;
    const landing = s.landing || '/';
    const l = landingStats[landing] || (landingStats[landing] = { name: landing, sessions: 0, carts: 0, orders: 0, orderingSessions: 0, orderValue: 0 });
    l.sessions++;
    if (s.cart) l.carts++;
    if (s.order) { l.orders += s.orders; l.orderingSessions++; l.orderValue += s.orderValue; }
    if (s.campaign) {
      const key = [s.source || 'Direct', s.medium || 'unknown', s.campaign, s.content || ''].filter(Boolean).join(' / ');
      const c = campaignStats[key] || (campaignStats[key] = { name: key, sessions: 0, orders: 0, orderingSessions: 0, orderValue: 0 });
      c.sessions++;
      if (s.order) { c.orders += s.orders; c.orderingSessions++; c.orderValue += s.orderValue; }
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
  const allProductStats = Object.keys(productStats).map(id => {
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
  });
  // Bound the response while ranking the complete product population for every
  // supported sort. Send compact IDs; each displayed product is serialized once.
  const comparators = {
    opportunity: (a,b) => b.opportunityScore - a.opportunityScore || b.views - a.views,
    views: (a,b) => b.views - a.views,
    cartRate: (a,b) => b.cartRate - a.cartRate || b.uniqueViewers - a.uniqueViewers,
    sold: (a,b) => b.sold - a.sold,
    revenue: (a,b) => b.revenue - a.revenue,
    revenuePerViewer: (a,b) => b.revenuePerViewer - a.revenuePerViewer
  };
  const productRankings = {}, rankedIds = new Set();
  Object.keys(comparators).forEach(key => {
    productRankings[key] = allProductStats.slice().sort((a,b) => comparators[key](a,b) || a.id.localeCompare(b.id)).slice(0,20).map(p => p.id);
    productRankings[key].forEach(id => rankedIds.add(id));
  });
  const productRankingRows = allProductStats.filter(p => rankedIds.has(p.id));
  const productsById = new Map(productRankingRows.map(p => [p.id, p]));
  const topProducts = productRankings.opportunity.map(id => productsById.get(id));

  const landingPages = Object.values(landingStats).map(x => ({
    name: x.name, sessions: x.sessions, carts: x.carts, orders: x.orders,
    orderingSessions: x.orderingSessions, orderValue: roundMoney_(x.orderValue), conversion: analyticsPct_(x.orderingSessions, x.sessions)
  })).sort((a, b) => b.sessions - a.sessions || b.orders - a.orders).slice(0, 10);
  const campaigns = Object.values(campaignStats).map(x => ({
    name: x.name, sessions: x.sessions, orders: x.orders,
    orderingSessions: x.orderingSessions, orderValue: roundMoney_(x.orderValue), conversion: analyticsPct_(x.orderingSessions, x.sessions)
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
  if (current.productViewSessions >= 20 && analyticsPct_(current.productCartSessions, current.productViewSessions) < 12) insights.push(analyticsInsight_('product-interest', 'Few product-view sessions include cart activity', analyticsPct_(current.productCartSessions, current.productViewSessions) + '% of product-view sessions also included a cart add.', 'warn', 'funnelCart'));
  if (current.checkoutSessions >= 5 && analyticsPct_(current.checkoutOrderSessions, current.checkoutSessions) < 55) insights.push(analyticsInsight_('checkout-drop', 'Few checkout sessions have a saved order', analyticsPct_(current.checkoutOrderSessions, current.checkoutSessions) + '% of checkout sessions also have a non-cancelled saved order.', 'warn', 'funnelCheckout'));
  if (current.searches >= 10 && current.zeroResultSearches > 0) insights.push(analyticsInsight_('search-gaps', 'Some searches return no products', current.zeroResultSearches + ' of ' + current.searches + ' tracked searches returned zero results.', 'info', 'productViews'));
  if (current.orders >= 5 && currentCancellationRate >= 15) insights.push(analyticsInsight_('cancellations', 'Cancellation rate needs attention', currentCancellationRate + '% of orders in this period were cancelled.', 'warn', 'orders'));
  const topViewed = productsById.get(productRankings.views[0]);
  if (topViewed && topViewed.views >= 8) insights.push(analyticsInsight_('top-interest', topViewed.name + ' is drawing attention', topViewed.views + ' views · ' + topViewed.adds + ' cart adds · ' + topViewed.sold + ' delivered units.', 'good', 'productViews'));
  const topSource = analyticsBreakdown_(sourceCounts)[0];
  if (topSource && topSource.value >= 3) insights.push(analyticsInsight_('top-source', topSource.name + ' is your top source', topSource.value + ' sessions in this period came from this source.', 'good', 'visitors'));
  if (!insights.length) insights.push(analyticsInsight_('collecting', 'Analytics is collecting', 'Keep this running for a few days. Insights become more useful once real traffic builds up.', 'neutral', 'visitors'));

  const report = {
    resetEpoch: epoch, generatedAt: actualNow.toISOString(), days: days, timezone: tz, periodStart: currentStart.toISOString(), periodEnd: now.toISOString(), includesPartialToday: window.partialToday, trackingSince: trackingStart ? trackingStart.toISOString() : '', comparisonAvailable: comparisonAvailable,
    metrics: metrics, series: series, funnel: funnel,
    rates: {
      sessionToProduct: analyticsPct_(current.productViewSessions, current.sessions),
      productToCart: analyticsPct_(current.productCartSessions, current.productViewSessions),
      sessionToCart: analyticsPct_(current.cartSessions, current.sessions),
      cartToCheckout: analyticsPct_(current.cartCheckoutSessions, current.cartSessions),
      checkoutToOrder: analyticsPct_(current.checkoutOrderSessions, current.checkoutSessions),
      cancellationRate: currentCancellationRate,
      deliveryRate: currentDeliveryRate
    },
    searches: { total: current.searches, zeroResults: current.zeroResultSearches, zeroResultRate: analyticsPct_(current.zeroResultSearches, current.searches) },
    sources: analyticsBreakdown_(sourceCounts), devices: analyticsBreakdown_(deviceCounts), pages: analyticsBreakdown_(pageCounts),
    categories: analyticsBreakdown_(categoryCounts), campaigns: campaigns, landingPages: landingPages,
    topProducts: topProducts, productRankings: productRankings, productRankingRows: productRankingRows, insights: insights
  };
  if (String(analyticsResetAt_() || '') !== epoch) throw new Error('Analytics was reset during this report. Refresh to reload.');
  if(!window.custom)cachePutJson_(cacheKey, report, ANALYTICS_REPORT_CACHE_TTL);
  return report;
}

function analyticsRegexEscape_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Optional hourly job. Preserves raw records; never sums daily unique visitors.
// Only an expired prefix is moved, in a bounded batch. Unexpected row order stops
// maintenance safely; it never guesses which live rows to remove.
function maintainShopAnalytics() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { busy: true };
  const props = PropertiesService.getScriptProperties();
  try {
    const sheet = analyticsSheet_(), heads = headers_(sheet), count = Math.min(300, sheet.getLastRow() - 1);
    if (count < 1) return { archived: 0 };
    const cutoff = Date.now() - 200 * 86400000;
    let rows = sheet.getRange(2, 1, count, heads.length).getValues();
    let take = 0;
    while (take < rows.length && rows[take][0] instanceof Date && +rows[take][0] < cutoff) take++;
    rows = rows.slice(0, take);
    if (!take) { props.setProperty('ANALYTICS_MAINTENANCE_AT', new Date().toISOString()); return { archived: 0 }; }
    const first = props.getProperty('ANALYTICS_FIRST_SEEN');
    const earliest = new Date(Math.min(...rows.map(r => +r[0])));
    if (!first || earliest < new Date(first)) props.setProperty('ANALYTICS_FIRST_SEEN', earliest.toISOString());
    // Persist stable archive IDs before copying. A crash at any later step can retry.
    ensureColumn_(sheet, 'storageId');
    const sourceHeads = headers_(sheet), idCol = sourceHeads.indexOf('storageid');
    rows = sheet.getRange(2, 1, take, sourceHeads.length).getValues();
    rows.forEach(row => { if (!row[idCol]) row[idCol] = Utilities.getUuid(); });
    sheet.getRange(2, idCol + 1, take, 1).setValues(rows.map(row => [row[idCol]]));
    SpreadsheetApp.flush();
    const ss = SpreadsheetApp.getActiveSpreadsheet(), groups = {};
    rows.forEach(row => {
      const name = 'AnalyticsArchive_' + Utilities.formatDate(row[0], 'UTC', 'yyyy_MM');
      (groups[name] || (groups[name] = [])).push(row);
    });
    Object.keys(groups).forEach(name => {
      let archive = ss.getSheetByName(name);
      if (!archive) { archive = ss.insertSheet(name); archive.appendRow(sourceHeads); archive.hideSheet(); }
      const archiveHeads = headers_(archive);
      if (JSON.stringify(archiveHeads) !== JSON.stringify(sourceHeads)) throw new Error('Archive schema differs; source retained.');
      const group = groups[name];
      const pattern = '^(?:' + group.map(row => analyticsRegexEscape_(row[idCol])).join('|') + ')$';
      const existing = new Set();
      if (archive.getLastRow() > 1) archive.getRange(2, idCol + 1, archive.getLastRow() - 1, 1).createTextFinder(pattern).useRegularExpression(true).matchEntireCell(true).findAll().forEach(hit => existing.add(String(hit.getValue())));
      const missing = group.filter(row => !existing.has(String(row[idCol])));
      if (missing.length) archive.getRange(archive.getLastRow() + 1, 1, missing.length, sourceHeads.length).setValues(missing);
      SpreadsheetApp.flush();
      const hits = archive.getRange(2, idCol + 1, archive.getLastRow() - 1, 1).createTextFinder(pattern).useRegularExpression(true).matchEntireCell(true).findAll();
      const saved = {};
      hits.forEach(hit => { saved[String(hit.getValue())] = archive.getRange(hit.getRow(), 1, 1, sourceHeads.length).getValues()[0]; });
      group.forEach(row => { if (JSON.stringify(saved[String(row[idCol])]) !== JSON.stringify(row)) throw new Error('Archive verification failed; source retained.'); });
    });
    sheet.deleteRows(2, take);
    props.setProperty('ANALYTICS_MAINTENANCE_AT', new Date().toISOString());
    props.deleteProperty('ANALYTICS_MAINTENANCE_ERROR');
    return { archived: take };
  } catch (err) {
    props.setProperty('ANALYTICS_MAINTENANCE_ERROR', String(err.message || err).slice(0, 300));
    throw err;
  } finally { lock.releaseLock(); }
}
function setupShopMaintenance() {
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'rebuildShopDailyAnalytics')) ScriptApp.newTrigger('rebuildShopDailyAnalytics').timeBased().everyDays(1).atHour(2).create();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'maintainShopAnalytics')) {
    ScriptApp.newTrigger('maintainShopAnalytics').timeBased().everyHours(1).create();
  }
  return { success: true };
}
// Run manually in the Apps Script editor. Never exposed as a public web action.
function getShopOperationalHealth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties();
  const pending = [], telegramPending = [];
  const transactions = ss.getSheetByName('OrderTransactions');
  if (transactions) rowsAsObjects_(transactions).forEach(row => {
    if (String(row.status) === 'Pending') pending.push(new Date(row.updated).getTime());
  });
  if (transactions && transactions.getLastRow() > 1 && transactions.getLastColumn() >= 5) {
    transactions.getRange(2, 1, transactions.getLastRow() - 1, 5).getValues().forEach(row => {
      if (String(row[4]) === 'Pending') telegramPending.push(new Date(row[3]).getTime());
    });
  }
  const age = values => { const valid = values.filter(Number.isFinite); return valid.length ? Math.max(0, (Date.now() - Math.min(...valid)) / 3600000) : null; };
  const analytics = ss.getSheetByName(ANALYTICS_SHEET);
  const result = {
    checkedAt: new Date().toISOString(), pendingTransactions: pending.length,
    oldestPendingHours: pending.length ? age(pending) : 0,
    pendingTelegramNotifications: telegramPending.length,
    oldestTelegramPendingHours: telegramPending.length ? age(telegramPending) : 0,
    activeAnalyticsRows: analytics ? Math.max(0, analytics.getLastRow() - 1) : 0,
    maintenanceAt: props.getProperty('ANALYTICS_MAINTENANCE_AT') || '',
    maintenanceError: props.getProperty('ANALYTICS_MAINTENANCE_ERROR') || '',
    maintenanceInstalled: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'maintainShopAnalytics')
  };
  console.log(JSON.stringify(result));
  return result;
}

function analyticsWindow_(options, now, tz) {
  const today=analyticsDateKey_(now,tz), custom=!!(options.startDate||options.endDate);
  let days=[7,30,90].indexOf(Number(options.days))>=0?Number(options.days):30;
  let firstDay=analyticsDayOffset_(today,1-days),lastDay=today;
  if(custom){
    firstDay=String(options.startDate||'');lastDay=String(options.endDate||'');
    [firstDay,lastDay].forEach(key=>{const date=new Date(key+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||isNaN(date)||date.toISOString().slice(0,10)!==key)throw new Error('Choose valid start and end dates.');});
    days=Math.round((new Date(lastDay+'T00:00:00Z')-new Date(firstDay+'T00:00:00Z'))/86400000)+1;
    if(days<1||days>90||lastDay>today||firstDay<analyticsDayOffset_(today,-89))throw new Error('Choose a range within the last 90 calendar days.');
  }
  const partialToday=lastDay===today;
  const end=partialToday?now:new Date(Utilities.parseDate(analyticsDayOffset_(lastDay,1),tz,'yyyy-MM-dd').getTime()-1);
  return {days:days,custom:custom,firstDay:firstDay,lastDay:lastDay,end:end,partialToday:partialToday};
}
