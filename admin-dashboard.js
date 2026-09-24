/* Admin dashboard metrics and visual summaries. Requires admin.js. */
/* ---------------- Dashboard ---------------- */
let LAST_DASHBOARD = null;
function animateNumber(el, target, prefix) {
  if (!el) return;
  cancelAnimationFrame(el._numberFrame);
  if (reducedMotion()) {
    el.textContent = (prefix || '') + target.toLocaleString('en-IN');
    return;
  }
  const duration = 500,
    start = performance.now();
  const from = Number(String(el.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
  function step(now) {
    const p = Math.min(1, (now - start) / duration),
      eased = 1 - Math.pow(1 - p, 3),
      value = Math.round(from + (target - from) * eased);
    el.textContent = (prefix || '') + value.toLocaleString('en-IN');
    if (p < 1) el._numberFrame = requestAnimationFrame(step);
  }
  el._numberFrame = requestAnimationFrame(step);
}
async function loadDashboard(forceFresh = false) {
  const sequence = ++dashboardRequestSequence;
  try {
    const data = await adminRead('adminDashboard', forceFresh ? { forceFresh: true } : undefined);
    if (sequence !== dashboardRequestSequence) return false;
    LAST_DASHBOARD = data;
    renderDashboard(data);
    return true;
  } catch (err) {
    if (sequence === dashboardRequestSequence) $('#dashTopProducts').innerHTML = `<p class="hint">Could not load dashboard: ${escapeHtml(err.message)}</p>`;
    return false;
  }
}
function moneyShort(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}
function orderDate(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function recentOrders() {
  return (ORDERS || []).slice().sort((a, b) => (orderDate(b.date)?.getTime() || 0) - (orderDate(a.date)?.getTime() || 0));
}
function buildSevenDaySales() {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      key: d.toDateString(),
      label: d.toLocaleDateString('en-IN', {
        weekday: 'short'
      }),
      total: 0
    });
  }
  (ORDERS || []).forEach(o => {
    if (!['Delivered', 'Fulfilled'].includes(o.status)) return;
    const d = orderDate(o.date);
    if (!d) return;
    const hit = days.find(x => x.key === new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString());
    if (hit) hit.total += Number(o.total) || 0;
  });
  return days;
}
function renderDashboard(d) {
  const pending = d.statusCounts && d.statusCounts.Pending || 0,
    monthOrders = Number(d.monthOrders) || 0;
  animateNumber($('#statTodayRevenue'), Math.round(d.todayRevenue || 0), '₹');
  $('#statTodayOrders').textContent = `${d.todayOrders || 0} order${d.todayOrders === 1 ? '' : 's'} today`;
  animateNumber($('#statMonthRevenue'), Math.round(d.monthRevenue || 0), '₹');
  $('#statMonthOrders').textContent = `${monthOrders} order${monthOrders === 1 ? '' : 's'} this month`;
  if (d.accountingIncomplete) {
    cancelAnimationFrame($('#statMonthProfit')._numberFrame);
    $('#statMonthProfit').textContent = 'Incomplete';
  } else animateNumber($('#statMonthProfit'), Math.round(d.monthProfit || 0), '₹');
  const avg = monthOrders ? (Number(d.monthRevenue) || 0) / monthOrders : 0;
  animateNumber($('#statAverageOrder'), Math.round(avg), '₹');
  $('#statPending').textContent = `${pending} pending${pending === 1 ? '' : ' orders'}`;
  $('#dashGreetingSub').textContent = pending ? `${pending} order${pending === 1 ? '' : 's'} need${pending === 1 ? 's' : ''} your attention.` : 'Everything looks under control today.';
  const attention = [];
  if (pending) attention.push({
    icon: '⏳',
    title: `${pending} pending order${pending === 1 ? '' : 's'}`,
    sub: 'Open orders and update their status',
    action: 'pending'
  });
  const critical = (d.lowStock || []).filter(p => Number(p.qty) <= 2).length;
  if (critical) attention.push({
    icon: '📦',
    title: `${critical} product${critical === 1 ? '' : 's'} critically low`,
    sub: 'Stock is at 2 or below',
    action: 'products'
  });
  $('#dashAttention').innerHTML = attention.map(a => `<button class="dash-alert" data-dash-action="${a.action}"><span class="alert-icon">${a.icon}</span><span class="alert-copy"><strong>${a.title}</strong><small>${a.sub}</small></span><span class="alert-arrow">›</span></button>`).join('');
  if (d.telegram) {
    const t = d.telegram,
      notice = document.createElement('p');
    notice.className = 'hint';
    notice.textContent = `Telegram: ${t.pending} awaiting delivery. ${t.lastRun ? 'Last queue run: ' + formatDateTime(t.lastRun) : 'No queue run recorded yet. Check the background trigger if orders are waiting.'}${t.lastSuccess ? ' Last successful notification: ' + formatDateTime(t.lastSuccess) : ''}`;
    $('#dashAttention').appendChild(notice);
  }
  const top = d.topProducts || [],
    max = Math.max(1, ...top.map(p => Number(p.revenue) || 0));
  $('#dashTopProducts').innerHTML = top.length ? top.map((p, i) => `<div class="dash-product-row"><span class="dash-rank">${i + 1}</span><div class="dash-product-name"><strong>${escapeHtml(p.name || '(unknown)')}</strong><div class="dash-product-meta">${Number(p.qty) || 0} sold</div></div><div class="dash-product-bar-track"><div class="dash-product-bar-fill" style="width:${Math.round((Number(p.revenue) || 0) / max * 100)}%"></div></div><div class="dash-product-value">${moneyShort(p.revenue)}</div></div>`).join('') : '<p class="hint">No sales recorded yet this month.</p>';
  const sc = d.statusCounts || {},
    statuses = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Fulfilled', 'Cancelled'],
    total = statuses.reduce((n, s) => n + (sc[s] || 0), 0);
  if (!total) {
    $('#dashStatusBar').style.display = 'none';
    $('#dashStatusLegend').innerHTML = '';
    $('#dashStatusEmpty').style.display = 'block';
  } else {
    $('#dashStatusBar').style.display = 'flex';
    $('#dashStatusEmpty').style.display = 'none';
    $('#dashStatusBar').innerHTML = statuses.map(s => {
      const c = sc[s] || 0;
      if (!c) return '';
      return `<div class="dash-status-seg ${s.toLowerCase()}" style="width:${c / total * 100}%">${c}</div>`;
    }).join('');
    $('#dashStatusLegend').innerHTML = statuses.map(s => `<span class="dash-legend"><b>${sc[s] || 0}</b> ${s}</span>`).join('');
  }
  const low = d.lowStock || [];
  $('#dashLowStock').innerHTML = low.length ? low.map(p => `<div class="dash-lowstock-item"><div><div class="lowstock-name">${escapeHtml(p.name)}</div><div class="lowstock-state">${Number(p.qty) <= 2 ? 'Critical — restock soon' : 'Low stock'}</div></div><span class="qty">${escapeHtml(p.qty)} left</span></div>`).join('') : '<p class="hint">All tracked products have healthy stock.</p>';
  const recent = d.recentOrders || recentOrders().slice(0, 5);
  $('#dashRecentOrders').innerHTML = recent.length ? recent.map(o => {
    const st = o.status || 'Pending';
    return `<div class="dash-recent-row"><div class="dash-recent-icon">🧾</div><div class="dash-recent-copy"><strong>${escapeHtml(o.customername || o.orderid || 'Order')}</strong><span>${escapeHtml(o.orderid || '')} · ${escapeHtml(formatDateTime(o.date))}</span></div><div class="dash-recent-total">${moneyShort(o.total)}<br><span class="status-pill ${escapeHtml(st.toLowerCase())}">${escapeHtml(st)}</span></div></div>`;
  }).join('') : '<p class="hint">No recent orders yet.</p>';
  const days = d.sevenDaySales || buildSevenDaySales(),
    maxDay = Math.max(1, ...days.map(x => x.total)),
    week = days.reduce((a, x) => a + x.total, 0);
  $('#dashWeekTotal').textContent = moneyShort(week);
  $('#dashSalesChart').innerHTML = days.some(x => x.total) ? days.map(x => `<div class="dash-bar-wrap"><span class="dash-bar-value">${x.total ? moneyShort(x.total) : ''}</span><div class="dash-bar" style="height:${Math.max(6, Math.round(x.total / maxDay * 82))}%"></div><span class="dash-bar-label">${escapeHtml(x.label)}</span></div>`).join('') : '<p class="hint dash-chart-empty">No sales activity in the last 7 days.</p>';
  $$('[data-dash-action]').forEach(btn => btn.onclick = () => {
    const a = btn.dataset.dashAction;
    if (a === 'pending') {
      switchTab('orders');
      $('#orderStatusFilter').value = 'Pending';
      orderPage = 0;
      loadOrders();
    } else if (a === 'orders') switchTab('orders');else if (a === 'products') switchTab('products');
  });
}
