/* DSB Admin Analytics — focused ecommerce analytics, no charting dependency. */
(function () {
  'use strict';
  let report = null;
  let focus = 'visitors';
  let loading = false;

  const metricMeta = {
    visitors: { label: 'Visitors', series: 'visitors', format: 'number' },
    sessions: { label: 'Sessions', series: 'sessions', format: 'number' },
    productViews: { label: 'Product views', series: 'productViews', format: 'number' },
    addToCarts: { label: 'Added to cart', series: 'addToCarts', format: 'number' },
    checkouts: { label: 'Checkout starts', series: 'checkouts', format: 'number' },
    orders: { label: 'Orders placed', series: 'orders', format: 'number' },
    deliveredOrders: { label: 'Delivered orders', series: 'deliveredOrders', format: 'number' },
    revenue: { label: 'Placed order value', series: 'revenue', format: 'money' },
    deliveredRevenue: { label: 'Delivered revenue', series: 'deliveredRevenue', format: 'money' },
    conversion: { label: 'Visitor conversion', series: null, format: 'percent' }
  };

  const $a = id => document.getElementById(id);
  function money(v) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function number(v) { return Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  function percent(v) { return (Number(v) || 0).toFixed(1).replace(/\.0$/, '') + '%'; }
  function fmt(v, type) { return type === 'money' ? money(v) : type === 'percent' ? percent(v) : number(v); }

  function deltaHtml(value) {
    const n = Number(value) || 0;
    const cls = n > .05 ? 'up' : n < -.05 ? 'down' : 'flat';
    const arrow = n > .05 ? '↑' : n < -.05 ? '↓' : '–';
    return `<span class="analytics-delta ${cls}">${arrow} ${Math.abs(n).toFixed(1).replace(/\.0$/, '')}%</span>`;
  }

  function renderKpis() {
    const wrap = $a('analyticsKpis');
    wrap.innerHTML = Object.keys(metricMeta).map(key => {
      const meta = metricMeta[key], m = report.metrics[key] || { value: 0, delta: 0 };
      return `<button type="button" class="analytics-kpi ${focus === key ? 'active' : ''}" data-analytics-focus="${key}">
        <span class="analytics-kpi-label">${meta.label}</span>
        <span class="analytics-kpi-value">${fmt(m.value, meta.format)}</span>
        <span class="analytics-kpi-foot"><span>vs previous ${report.days}d</span>${deltaHtml(m.delta)}</span>
      </button>`;
    }).join('');
  }

  function chartValues() {
    const meta = metricMeta[focus];
    if (focus === 'conversion') return report.series.map(x => ({ label: x.label, value: x.visitors ? x.convertedVisitors * 100 / x.visitors : 0 }));
    return report.series.map(x => ({ label: x.label, value: Number(x[meta.series]) || 0 }));
  }

  function renderChart() {
    const meta = metricMeta[focus], data = chartValues(), wrap = $a('analyticsChart');
    $a('analyticsChartTitle').textContent = meta.label + ' trend';
    $a('analyticsChartValue').textContent = fmt(report.metrics[focus]?.value || 0, meta.format);
    if (!data.length || data.every(x => !x.value)) {
      wrap.innerHTML = '<div class="analytics-empty">No tracked activity yet for this metric.<br>New storefront activity will appear here automatically.</div>';
      $a('analyticsChartLabels').innerHTML = '';
      return;
    }
    const width = 900, height = 220, pad = 12;
    const max = Math.max(...data.map(x => x.value), 1);
    const points = data.map((x, i) => {
      const px = data.length === 1 ? width / 2 : pad + i * (width - pad * 2) / (data.length - 1);
      const py = height - pad - (x.value / max) * (height - pad * 2);
      return [px, py];
    });
    const line = points.map(p => p.join(',')).join(' ');
    const area = `${pad},${height-pad} ${line} ${width-pad},${height-pad}`;
    wrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${meta.label} over time">
      <defs><linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5e9e93" stop-opacity=".24"/><stop offset="100%" stop-color="#5e9e93" stop-opacity=".02"/></linearGradient></defs>
      <line class="analytics-chart-grid" x1="0" y1="${height*.25}" x2="${width}" y2="${height*.25}"/><line class="analytics-chart-grid" x1="0" y1="${height*.5}" x2="${width}" y2="${height*.5}"/><line class="analytics-chart-grid" x1="0" y1="${height*.75}" x2="${width}" y2="${height*.75}"/>
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
      return `<button type="button" class="analytics-funnel-step" data-analytics-focus="${step.key}"><b>${number(step.value)}</b><span>${step.label}</span><span class="analytics-funnel-rate">${rate}</span></button>`;
    }).join('');
  }

  function renderInsights() {
    $a('analyticsInsights').innerHTML = report.insights.map(x => `<button type="button" class="analytics-insight ${x.tone || ''}" data-analytics-focus="${x.focus || 'visitors'}"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.text)}</span></button>`).join('');
  }

  function renderProducts() {
    const body = $a('analyticsProducts');
    if (!report.topProducts.length) { body.innerHTML = '<tr><td colspan="7" class="analytics-status">No product activity yet.</td></tr>'; return; }
    body.innerHTML = report.topProducts.map(p => `<tr data-product-id="${escapeHtml(p.id)}" title="Open product editor">
      <td><span class="analytics-product-name">${escapeHtml(p.name)}</span><span class="analytics-product-id">${escapeHtml(p.id)}</span></td>
      <td class="num">${number(p.views)}</td><td class="num">${number(p.adds)}</td><td class="num">${percent(p.cartRate)}</td>
      <td class="num">${number(p.sold)}</td><td class="num">${money(p.revenue)}</td><td class="num">${money(p.revenuePerView)}</td></tr>`).join('');
  }

  function breakdownHtml(title, rows) {
    if (!rows?.length) return `<div class="analytics-breakdown"><h4>${title}</h4><p class="hint">No data yet.</p></div>`;
    const max = Math.max(...rows.map(x => Number(x.value) || 0), 1);
    return `<div class="analytics-breakdown"><h4>${title}</h4>${rows.slice(0,6).map(x => `<div class="analytics-break-row"><span>${escapeHtml(x.name)}</span><b>${number(x.value)}</b><div class="analytics-break-bar"><i style="width:${Math.max(3,(Number(x.value)||0)*100/max)}%"></i></div></div>`).join('')}</div>`;
  }

  function renderBreakdowns() {
    const search = report.searches || {};
    const searchHtml = `<div class="analytics-breakdown"><h4>Store search</h4><div class="analytics-health-inline"><span><b>${number(search.total)}</b> searches</span><span><b>${number(search.zeroResults)}</b> no results</span><span><b>${percent(search.zeroResultRate)}</b> zero-result rate</span></div></div>`;
    $a('analyticsBreakdowns').innerHTML = breakdownHtml('Traffic sources', report.sources) + breakdownHtml('Devices', report.devices) + breakdownHtml('Categories', report.categories) + searchHtml;
  }

  function renderHealth() {
    const m = report.metrics, r = report.rates || {};
    const entries = [
      ['Average order value', money(m.aov?.value)],
      ['Cancellation rate', percent(r.cancellationRate)],
      ['Delivery completion', percent(r.deliveryRate)],
      ['Product → cart', percent(r.productToCart)],
      ['Cart → checkout', percent(r.cartToCheckout)],
      ['Checkout → order', percent(r.checkoutToOrder)]
    ];
    $a('analyticsHealth').innerHTML = entries.map(([label,value]) => `<div class="analytics-health-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function performanceTable(rows, empty, includeCart) {
    if (!rows?.length) return `<div class="analytics-status">${empty}</div>`;
    return `<div class="analytics-table-wrap"><table class="analytics-table analytics-compact-table"><thead><tr><th>Entry</th><th class="num">Sessions</th>${includeCart ? '<th class="num">Cart</th>' : ''}<th class="num">Orders</th><th class="num">Conv.</th><th class="num">Order value</th></tr></thead><tbody>${rows.map(x => `<tr><td><span class="analytics-product-name">${escapeHtml(x.name)}</span></td><td class="num">${number(x.sessions)}</td>${includeCart ? `<td class="num">${number(x.carts)}</td>` : ''}<td class="num">${number(x.orders)}</td><td class="num">${percent(x.conversion)}</td><td class="num">${money(x.orderValue)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderAcquisition() {
    $a('analyticsLanding').innerHTML = performanceTable(report.landingPages, 'No landing-page data yet.', true);
    $a('analyticsCampaigns').innerHTML = performanceTable(report.campaigns, 'No UTM campaigns tracked yet.', false);
  }

  function render() {
    renderKpis(); renderChart(); renderFunnel(); renderInsights(); renderProducts(); renderBreakdowns(); renderHealth(); renderAcquisition();
    const d = new Date(report.generatedAt), started = report.trackingSince ? new Date(report.trackingSince) : null;
    const updated = 'Updated ' + (isNaN(d) ? 'now' : d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}));
    const coverage = started && !isNaN(started) ? ' · tracking since ' + started.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '';
    $a('analyticsFresh').textContent = updated + coverage;
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
    focus = key; renderKpis(); renderChart();
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
    $a('tab-analytics')?.addEventListener('click', e => {
      const focusBtn = e.target.closest('[data-analytics-focus]'); if (focusBtn) setFocus(focusBtn.dataset.analyticsFocus);
      const row = e.target.closest('tr[data-product-id]'); if (row) openProduct(row.dataset.productId);
    });
  });

  window.DSBAdminAnalytics = Object.freeze({ load, setFocus });
})();
