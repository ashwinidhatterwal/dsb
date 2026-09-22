/* DSB Admin Analytics — focused ecommerce analytics, no charting dependency. */
(function () {
  'use strict';
  let report = null;
  let focus = 'visitors';
  let loading = false;
  let productSort = 'opportunity';

  const metricMeta = {
    visitors: { label: 'Visitors', series: 'visitors', format: 'number', card: true },
    sessions: { label: 'Sessions', series: 'sessions', format: 'number', card: true },
    orders: { label: 'Orders placed', series: 'orders', format: 'number', card: true },
    deliveredRevenue: { label: 'Delivered revenue', series: 'deliveredRevenue', format: 'money', card: true },
    conversion: { label: 'Tracked conversion', series: null, format: 'percent', card: true },
    aov: { label: 'Average order value', series: 'aov', format: 'money', card: true },
    productViews: { label: 'Product views', series: 'productViews', format: 'number' },
    addToCarts: { label: 'Added to cart', series: 'addToCarts', format: 'number' },
    checkouts: { label: 'Checkout starts', series: 'checkouts', format: 'number' },
    deliveredOrders: { label: 'Delivered orders', series: 'deliveredOrders', format: 'number' },
    revenue: { label: 'Placed order value', series: 'revenue', format: 'money' },
    funnelProduct: { label: 'Product-view sessions', series: 'productViewSessions', format: 'number' },
    funnelCart: { label: 'Cart sessions', series: 'cartSessions', format: 'number' },
    funnelCheckout: { label: 'Checkout sessions', series: 'checkoutSessions', format: 'number' },
    funnelOrder: { label: 'Tracked order sessions', series: 'orderSessions', format: 'number' }
  };

  const $a = id => document.getElementById(id);
  function money(v) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function number(v) { return Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function percent(v) { return (Number(v) || 0).toFixed(1).replace(/\.0$/, '') + '%'; }
  function fmt(v, type) { return type === 'money' ? money(v) : type === 'percent' ? percent(v) : number(v); }
  function metricValue(key) {
    if (report?.metrics?.[key]) return Number(report.metrics[key].value) || 0;
    const step = report?.funnel?.find(x => x.key === key);
    return Number(step?.value) || 0;
  }

  function deltaHtml(value) {
    if (value === null || value === undefined || !report?.comparisonAvailable) {
      return '<span class="analytics-delta unavailable">Not enough history</span>';
    }
    const n = Number(value) || 0;
    const cls = n > .05 ? 'up' : n < -.05 ? 'down' : 'flat';
    const arrow = n > .05 ? '↑' : n < -.05 ? '↓' : '–';
    return `<span class="analytics-delta ${cls}">${arrow} ${Math.abs(n).toFixed(1).replace(/\.0$/, '')}%</span>`;
  }

  function renderKpis() {
    const wrap = $a('analyticsKpis');
    const keys = Object.keys(metricMeta).filter(key => metricMeta[key].card);
    wrap.innerHTML = keys.map(key => {
      const meta = metricMeta[key], m = report.metrics[key] || { value: 0, delta: null };
      const compare = report.comparisonAvailable ? `vs previous ${report.days}d` : 'comparison pending';
      return `<button type="button" class="analytics-kpi ${focus === key ? 'active' : ''}" data-analytics-focus="${key}">
        <span class="analytics-kpi-label">${meta.label}</span>
        <span class="analytics-kpi-value">${fmt(m.value, meta.format)}</span>
        <span class="analytics-kpi-foot"><span>${compare}</span>${deltaHtml(m.delta)}</span>
      </button>`;
    }).join('');
  }

  function chartValues() {
    const meta = metricMeta[focus] || metricMeta.visitors;
    if (focus === 'conversion') return report.series.map(x => ({ label: x.label, value: x.visitors ? x.convertedVisitors * 100 / x.visitors : 0 }));
    return report.series.map(x => ({ label: x.label, value: Number(x[meta.series]) || 0 }));
  }

  function renderChart() {
    const meta = metricMeta[focus] || metricMeta.visitors;
    const data = chartValues(), wrap = $a('analyticsChart');
    $a('analyticsChartTitle').textContent = meta.label + ' trend';
    $a('analyticsChartValue').textContent = fmt(metricValue(focus), meta.format);
    if (!data.length || data.every(x => !x.value)) {
      wrap.innerHTML = '<div class="analytics-empty">No tracked activity yet for this metric.<br>New storefront activity will appear here automatically.</div>';
      $a('analyticsChartLabels').innerHTML = '';
      return;
    }
    const width = 900, height = 220, left = 34, right = 12, top = 12, bottom = 16;
    const max = Math.max(...data.map(x => x.value), 1);
    const points = data.map((x, i) => {
      const px = data.length === 1 ? (left + width - right) / 2 : left + i * (width - left - right) / (data.length - 1);
      const py = height - bottom - (x.value / max) * (height - top - bottom);
      return [px, py];
    });
    const line = points.map(p => p.join(',')).join(' ');
    const area = `${left},${height-bottom} ${line} ${width-right},${height-bottom}`;
    const mid = max / 2;
    wrap.innerHTML = `<div class="analytics-y-scale" aria-hidden="true"><span>${fmt(max, meta.format)}</span><span>${fmt(mid, meta.format)}</span><span>0${meta.format === 'percent' ? '%' : ''}</span></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${meta.label} over time">
      <defs><linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5e9e93" stop-opacity=".24"/><stop offset="100%" stop-color="#5e9e93" stop-opacity=".02"/></linearGradient></defs>
      <line class="analytics-chart-grid" x1="${left}" y1="${top + (height-top-bottom)*.25}" x2="${width-right}" y2="${top + (height-top-bottom)*.25}"/><line class="analytics-chart-grid" x1="${left}" y1="${top + (height-top-bottom)*.5}" x2="${width-right}" y2="${top + (height-top-bottom)*.5}"/><line class="analytics-chart-grid" x1="${left}" y1="${top + (height-top-bottom)*.75}" x2="${width-right}" y2="${top + (height-top-bottom)*.75}"/>
      <polygon class="analytics-chart-area" points="${area}"/><polyline class="analytics-chart-line" points="${line}"/>${points.map((p,i)=>`<circle class="analytics-chart-dot" cx="${p[0]}" cy="${p[1]}" r="${data.length > 31 ? 2 : 3}"><title>${data[i].label}: ${fmt(data[i].value, meta.format)}</title></circle>`).join('')}
    </svg>`;
    const labels = data.length <= 7 ? data : [data[0], data[Math.floor((data.length-1)/2)], data[data.length-1]];
    $a('analyticsChartLabels').innerHTML = labels.map(x => `<span>${x.label}</span>`).join('');
  }

  function renderFunnel() {
    const wrap = $a('analyticsFunnel');
    wrap.innerHTML = report.funnel.map((step, i) => {
      const prior = i ? report.funnel[i - 1].value : 0;
      const rate = i ? (prior ? percent(step.value * 100 / prior) + ' from previous' : '—') : 'All tracked sessions';
      return `<button type="button" class="analytics-funnel-step ${focus === step.key ? 'active' : ''}" data-analytics-focus="${step.key}"><b>${number(step.value)}</b><span>${step.label}</span><span class="analytics-funnel-rate">${rate}</span></button>`;
    }).join('');
  }

  function renderInsights() {
    $a('analyticsInsights').innerHTML = report.insights.map(x => `<button type="button" class="analytics-insight ${x.tone || ''}" data-analytics-focus="${x.focus || 'visitors'}"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.text)}</span></button>`).join('');
  }

  function sortedProducts() {
    const rows = (report.topProducts || []).slice();
    const by = {
      opportunity: (a,b) => (b.opportunityScore || 0) - (a.opportunityScore || 0) || b.views - a.views,
      views: (a,b) => b.views - a.views,
      cartRate: (a,b) => b.cartRate - a.cartRate || b.uniqueViewers - a.uniqueViewers,
      sold: (a,b) => b.sold - a.sold,
      revenue: (a,b) => b.revenue - a.revenue,
      revenuePerViewer: (a,b) => b.revenuePerViewer - a.revenuePerViewer
    };
    return rows.sort(by[productSort] || by.opportunity);
  }

  function renderProducts() {
    const body = $a('analyticsProducts');
    const rows = sortedProducts();
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="analytics-status">No product activity yet.</td></tr>'; return; }
    body.innerHTML = rows.map(p => `<tr data-product-id="${escapeHtml(p.id)}" title="Open product editor">
      <td data-label="Product"><span class="analytics-product-name">${escapeHtml(p.name)}</span><span class="analytics-product-id">${escapeHtml(p.id)}</span></td>
      <td data-label="Views" class="num">${number(p.views)}</td><td data-label="Unique viewers" class="num">${number(p.uniqueViewers)}</td><td data-label="Viewer → cart" class="num">${percent(p.cartRate)}</td>
      <td data-label="Sold" class="num">${number(p.sold)}</td><td data-label="Delivered revenue" class="num">${money(p.revenue)}</td><td data-label="₹ / viewer" class="num">${money(p.revenuePerViewer)}</td><td data-label="Opportunity" class="num">${escapeHtml(p.opportunityLabel || '—')}</td></tr>`).join('');
  }

  function breakdownHtml(title, rows) {
    if (!rows?.length) return `<div class="analytics-breakdown"><h4>${title}</h4><p class="hint">No data yet.</p></div>`;
    const max = Math.max(...rows.map(x => Number(x.value) || 0), 1);
    return `<div class="analytics-breakdown"><h4>${title}</h4>${rows.slice(0,6).map(x => `<div class="analytics-break-row"><span>${escapeHtml(x.name)}</span><b>${number(x.value)}</b><div class="analytics-break-bar"><i style="width:${Math.max(3,(Number(x.value)||0)*100/max)}%"></i></div></div>`).join('')}</div>`;
  }

  function renderBreakdowns() {
    const search = report.searches || {};
    const searchHtml = `<div class="analytics-breakdown"><h4>Store search</h4><div class="analytics-health-inline"><span><b>${number(search.total)}</b> completed searches</span><span><b>${number(search.zeroResults)}</b> no results</span><span><b>${percent(search.zeroResultRate)}</b> zero-result rate</span></div></div>`;
    $a('analyticsBreakdowns').innerHTML = breakdownHtml('Traffic sources', report.sources) + breakdownHtml('Devices', report.devices) + breakdownHtml('Categories', report.categories) + searchHtml;
  }

  function renderHealth() {
    const m = report.metrics, r = report.rates || {};
    const entries = [
      ['Placed order value', money(m.revenue?.value)],
      ['Delivered orders', number(m.deliveredOrders?.value)],
      ['Cancellation rate', percent(r.cancellationRate)],
      ['Delivery completion', percent(r.deliveryRate)],
      ['Product → cart', percent(r.productToCart)],
      ['Cart → checkout', percent(r.cartToCheckout)],
      ['Checkout → tracked order', percent(r.checkoutToOrder)],
      ['Product views', number(m.productViews?.value)]
    ];
    $a('analyticsHealth').innerHTML = entries.map(([label,value]) => `<div class="analytics-health-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function friendlyEntry(raw) {
    const value = String(raw || '/');
    if (value === '/' || value === '/index.html') return { label: 'Home', detail: value };
    if (/^\/product\.html/i.test(value)) return { label: 'Product page', detail: value };
    if (/^\/(?:hi\/)?products\//i.test(value)) {
      let tail = value.split('/').pop().replace(/\.html(?:\?.*)?$/i, '');
      try { tail = decodeURIComponent(tail); } catch (_) {}
      if (/^p-[0-9a-f]{18,}$/i.test(tail)) tail = 'Product detail';
      else tail = tail.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { label: tail || 'Product detail', detail: value };
    }
    return { label: value.length > 42 ? value.slice(0, 39) + '…' : value, detail: value };
  }

  function performanceTable(rows, empty, includeCart, kind) {
    if (!rows?.length) return `<div class="analytics-status">${empty}</div>`;
    return `<div class="analytics-table-wrap"><table class="analytics-table analytics-compact-table analytics-mobile-cards"><thead><tr><th>Entry</th><th class="num">Sessions</th>${includeCart ? '<th class="num">Cart</th>' : ''}<th class="num">Tracked orders</th><th class="num">Conv.</th><th class="num">Order value</th></tr></thead><tbody>${rows.map(x => {
      const display = kind === 'campaign' ? { label: String(x.name || 'Campaign'), detail: String(x.name || '') } : friendlyEntry(x.name);
      return `<tr><td data-label="Entry"><span class="analytics-product-name" title="${escapeHtml(display.detail)}">${escapeHtml(display.label)}</span>${display.label !== display.detail ? `<span class="analytics-entry-detail">${escapeHtml(display.detail)}</span>` : ''}</td><td data-label="Sessions" class="num">${number(x.sessions)}</td>${includeCart ? `<td data-label="Cart" class="num">${number(x.carts)}</td>` : ''}<td data-label="Tracked orders" class="num">${number(x.orders)}</td><td data-label="Conversion" class="num">${percent(x.conversion)}</td><td data-label="Order value" class="num">${money(x.orderValue)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderAcquisition() {
    $a('analyticsLanding').innerHTML = performanceTable(report.landingPages, 'No landing-page data yet.', true, 'landing');
    $a('analyticsCampaigns').innerHTML = performanceTable(report.campaigns, 'No UTM campaigns tracked yet.', false, 'campaign');
  }

  function render() {
    renderKpis(); renderChart(); renderFunnel(); renderInsights(); renderProducts(); renderBreakdowns(); renderHealth(); renderAcquisition();
    const d = new Date(report.generatedAt), started = report.trackingSince ? new Date(report.trackingSince) : null;
    const updated = 'Updated ' + (isNaN(d) ? 'now' : d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));
    const coverage = started && !isNaN(started) ? ' · tracking since ' + started.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '';
    const compare = report.comparisonAvailable ? '' : ' · comparisons unlock after a full prior period';
    $a('analyticsFresh').textContent = updated + coverage + compare;
  }

  function clearLocalAnalyticsState() {
    // Clear this browser's pending analytics state so a test/admin device cannot
    // replay pre-reset events into the fresh dataset. Other browsers are safely
    // blocked server-side by the reset timestamp.
    ['dsb_analytics_queue_v3','dsb_analytics_queue_v2','dsb_analytics_session_v3','dsb_attribution_v3'].forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
  }

  async function resetAnalytics() {
    const btn = $a('analyticsResetConfirm');
    if (!btn || loading) return;
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Resetting…';
    try {
      const res = await adminFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: ADMIN_KEY, action: 'resetAnalytics' })
      });
      const data = await res.json();
      if (!data || data.error || data.success === false) throw new Error(data?.error || 'Reset failed');
      clearLocalAnalyticsState();
      try { $a('analyticsResetDialog')?.close(); } catch (_) {}
      report = null;
      focus = 'visitors';
      showToast('Analytics reset. Fresh tracking starts now.');
      await load(true);
    } catch (err) {
      showToast('Could not reset analytics: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function load(force) {
    if (loading || !API_URL || !ADMIN_KEY) return;
    if (report && !force) { render(); return; }
    loading = true;
    $a('analyticsStatus').hidden = false; $a('analyticsContent').hidden = true;
    $a('analyticsStatus').textContent = 'Loading analytics…';
    try {
      report = await adminRead('adminAnalytics', { days: Number($a('analyticsRange').value) || 30, force: !!force });
      if (!report?.metrics) throw new Error('Invalid analytics response');
      $a('analyticsStatus').hidden = true; $a('analyticsContent').hidden = false;
      const resetZone = $a('analyticsResetZone');
      if (resetZone) resetZone.hidden = ADMIN_PROFILE?.role !== 'admin';
      render();
    } catch (err) {
      $a('analyticsStatus').textContent = 'Analytics could not load: ' + err.message;
    } finally { loading = false; }
  }

  async function openProduct(id) {
    try {
      const data = await adminRead('adminProductsPage', { query: id, sort: 'id-asc', archived: false, page: 0 });
      const product = (data.products || []).find(p => String(p.id) === String(id));
      if (!product) return showToast('Product not found');
      fillForm(product);
    } catch (err) { showToast('Could not open product: ' + err.message); }
  }

  function setFocus(key) {
    if (!metricMeta[key]) return;
    focus = key; renderKpis(); renderFunnel(); renderChart();
    $a('analyticsTrendPanel')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function bindMenu() {
    const btn = $a('adminMoreBtn'), menu = $a('adminMoreMenu');
    if (!btn || !menu) return;
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded','false'); };
    btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
    menu.addEventListener('click', e => { if (e.target.closest('button,a')) close(); });
    document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.admin-more-wrap')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindMenu();
    $a('analyticsRange')?.addEventListener('change', () => { report = null; load(true); });
    $a('analyticsRefresh')?.addEventListener('click', () => { report = null; load(true); });
    $a('analyticsProductSort')?.addEventListener('change', e => { productSort = e.target.value || 'opportunity'; renderProducts(); });
    $a('analyticsResetOpen')?.addEventListener('click', () => {
      if (ADMIN_PROFILE?.role !== 'admin') return showToast('Only the owner/admin can reset analytics.');
      const dialog = $a('analyticsResetDialog');
      if (dialog?.showModal) dialog.showModal();
      else if (confirm('Reset analytics history and start fresh? Orders and products will not be deleted. This cannot be undone.')) resetAnalytics();
    });
    $a('analyticsResetConfirm')?.addEventListener('click', resetAnalytics);
    $a('analyticsResetDialog')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $a('tab-analytics')?.addEventListener('click', e => {
      const focusBtn = e.target.closest('[data-analytics-focus]'); if (focusBtn) setFocus(focusBtn.dataset.analyticsFocus);
      const row = e.target.closest('tr[data-product-id]'); if (row) openProduct(row.dataset.productId);
    });
  });

  window.DSBAdminAnalytics = Object.freeze({ load, setFocus });
})();
