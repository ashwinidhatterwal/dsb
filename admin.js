/* =========================================================
   Dhatterwal Suhag Bhandar — admin panel logic
   Talks to the Apps Script Web App deployed from apps-script/Code.gs
   ========================================================= */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

// Order and product data can contain anything a customer typed at checkout
// (name, phone, address) — this must never be inserted into HTML unescaped,
// or a malicious "name" like <img src=x onerror=...> could run script in
// this very page, right where the admin key lives in memory.
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Kept in memory only for this tab — not persisted, so it's re-entered
// each time the page is opened. See SETUP-GUIDE.md for how to deploy
// the Apps Script backend that this talks to.
// Deployed Apps Script Web App URL for this shop's Google Sheet.
// Pre-filled so the admin only has to enter the password below.
// Change this if you ever redeploy and get a new URL.
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbybavfXBC-5CNstiZx-giJcngXjHVKA1NljUQ6N55ybOu4OvunkQTVr3IFvLPp_9Ohu/exec';

// Image hosting (Cloudinary "unsigned upload") — lets the admin upload a
// photo straight from the browser and get back a permanent link, no server
// needed. Fill these in after creating a free Cloudinary account and an
// unsigned upload preset — see SETUP-GUIDE.md. Safe to leave the preset
// unsigned/public since it only allows uploads, not account access.
const CLOUDINARY_CLOUD_NAME = 'malfl6xv';
const CLOUDINARY_UPLOAD_PRESET = 'dhatterwal suhag bhandar';

let API_URL = '';
let ADMIN_KEY = '';
let PRODUCTS = [];
let editingProductId = null; // set while editing an existing product; null when adding a new one
let ORDERS = [];

async function adminRead(action){
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: ADMIN_KEY, action })
  });
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

function status(el, msg, ok){
  el.textContent = msg;
  el.className = 'statusline ' + (ok ? 'ok' : 'err');
}

function showToast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

async function loadProducts(){
  const statusEl = $('#connectStatus');
  try{
    const data = await adminRead('adminProducts');
    PRODUCTS = data;
    renderProductList();
    renderCategoryOptions();
    // First successful connect swaps the connect screen for the real app.
    $('#connectScreen').style.display = 'none';
    $('#adminApp').style.display = 'block';
  } catch(err){
    status(statusEl, 'Could not load products: ' + err.message, false);
    return;
  }
  loadOrders();
  loadDashboard();
}

function formatDateTime(value){
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value || '');
  return d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function loadOrders(){
  const wrap = $('#orderList');
  try{
    const data = await adminRead('adminOrders');
    ORDERS = data;
    renderOrderList();
    if (LAST_DASHBOARD) renderDashboard(LAST_DASHBOARD);
  } catch(err){
    wrap.innerHTML = `<p class="hint">Could not load orders: ${err.message}</p>`;
  }
}

function renderOrderList(){
  const wrap = $('#orderList');
  const q = $('#orderFilterInput').value.trim().toLowerCase();
  const statusFilter = $('#orderStatusFilter').value;
  const sortMode = $('#orderSort').value;

  let list = ORDERS.filter(o => {
    if (statusFilter !== 'all' && (o.status || 'Pending') !== statusFilter) return false;
    if (q && !`${o.customername} ${o.phone} ${o.orderid}`.toLowerCase().includes(q)) return false;
    return true;
  });

  list = list.slice().sort((a, b) => {
    if (sortMode === 'date-asc') return new Date(a.date) - new Date(b.date);
    if (sortMode === 'name-asc') return String(a.customername||'').localeCompare(String(b.customername||''));
    return new Date(b.date) - new Date(a.date); // date-desc default
  });

  $('#orderCountLabel').textContent = ORDERS.length;

  if (!list.length){
    wrap.innerHTML = `<p class="hint">No orders match.</p>`;
    return;
  }

  wrap.innerHTML = list.map(o => {
    const st = (o.status || 'Pending');
    const pillClass = st.toLowerCase();
    return `
    <div class="orow" data-id="${escapeHtml(o.orderid)}">
      <div class="ohead">
        <span class="oid">${escapeHtml(o.orderid)}</span>
        <span class="odate">${escapeHtml(formatDateTime(o.date))}</span>
      </div>
      <div class="ocust">${escapeHtml(o.customername) || '(no name)'}</div>
      <div class="ophone">${escapeHtml(o.phone)}${o.paymentmethod ? ` • ${escapeHtml(o.paymentmethod)}` : ''}</div>
      ${o.address ? `<div class="oaddress">${escapeHtml(o.address)}</div>` : ''}
      <div class="oitems">${escapeHtml(o.items)}</div>
      <div class="ofoot">
        <span class="ototal">₹${Number(o.total || 0).toLocaleString('en-IN')}${Number(o.discount) > 0 ? ` <small>(−₹${Number(o.discount).toLocaleString('en-IN')}${o.promocode ? ' ' + escapeHtml(o.promocode) : ''})</small>` : ''}</span>
        <span class="status-pill ${escapeHtml(pillClass)}">${escapeHtml(st)}</span>
      </div>
      <div class="order-controls" style="margin-top:8px;">
        <select data-role="statusSelect">
          <option value="Pending" ${st==='Pending'?'selected':''}>Pending</option>
          <option value="Confirmed" ${st==='Confirmed'?'selected':''}>Confirmed</option>
          <option value="Packed" ${st==='Packed'?'selected':''}>Packed</option>
          <option value="Shipped" ${st==='Shipped'?'selected':''}>Shipped</option>
          <option value="Delivered" ${st==='Delivered'?'selected':''}>Delivered</option>
          <option value="Fulfilled" ${st==='Fulfilled'?'selected':''}>Fulfilled</option>
          <option value="Cancelled" ${st==='Cancelled'?'selected':''}>Cancelled</option>
        </select>
        <button class="ghost-btn" data-role="saveStatus">Update</button>
      </div>
    </div>`;
  }).join('');

  $$('.orow', wrap).forEach(row => {
    const orderId = row.dataset.id;
    $('[data-role="saveStatus"]', row).addEventListener('click', () => {
      const newStatus = $('[data-role="statusSelect"]', row).value;
      updateOrderStatus(orderId, newStatus);
    });
  });
}

async function updateOrderStatus(orderId, newStatus){
  try{
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: ADMIN_KEY, action: 'updateOrderStatus', orderId, status: newStatus })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Order updated');
    await loadOrders();
  } catch(err){
    alert('Could not update order: ' + err.message);
  }
}

function renderCategoryOptions(){
  const cats = [...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
  const subs = [...new Set(PRODUCTS.map(p => p.subcategory).filter(Boolean))];
  $('#categoryList').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
  $('#subcategoryList').innerHTML = subs.map(s => `<option value="${escapeHtml(s)}">`).join('');
}

function renderProductList(){
  const wrap = $('#productList');
  const q = $('#filterInput').value.trim().toLowerCase();
  const list = PRODUCTS.filter(p => !q || `${p.name} ${p.category} ${p.subcategory} ${p.id}`.toLowerCase().includes(q));
  $('#countLabel').textContent = PRODUCTS.length;
  if (!list.length){
    wrap.innerHTML = `<p class="hint">No products match.</p>`;
    return;
  }
  wrap.innerHTML = list.map(p => `
    <div class="arow" data-id="${escapeHtml(p.id)}">
      <img class="arow-thumb" src="${escapeHtml(p.image)}" alt="" loading="lazy" decoding="async">
      <div class="arow-body">
        <div class="arow-title">${escapeHtml(p.name) || '(unnamed)'}</div>
        <div class="arow-sub">${escapeHtml(p.id)} • ${escapeHtml(p.category)} • ₹${Number(p.price)||0}${(p.stockqty !== undefined && p.stockqty !== null && p.stockqty !== '') ? ` • Qty ${Number(p.stockqty)||0}` : ''}</div>
      </div>
      <div class="arow-actions">
        <button data-act="edit" aria-label="Edit">✏️</button>
        <button data-act="delete" class="danger" aria-label="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
  $$('.arow', wrap).forEach(row => {
    const id = row.dataset.id;
    const product = PRODUCTS.find(p => String(p.id) === String(id));
    $('[data-act="edit"]', row).addEventListener('click', () => fillForm(product));
    $('[data-act="delete"]', row).addEventListener('click', () => deleteProduct(id, product?.name));
  });
}

function fillForm(p){
  editingProductId = p.id || null;
  $('#f-id').value = p.id || '';
  $('#f-id').readOnly = true;
  $('#f-name').value = p.name || '';
  $('#f-nameHindi').value = p.namehindi || '';
  $('#f-category').value = p.category || '';
  $('#f-subcategory').value = p.subcategory || '';
  $('#f-price').value = p.price || '';
  $('#f-mrp').value = p.mrp || '';
  $('#f-costprice').value = (p.costprice === undefined || p.costprice === null || p.costprice === '') ? '' : p.costprice;
  $('#f-image').value = p.image || '';
  $('#f-description').value = p.description || '';
  $('#f-stock').value = p.stock || 'in stock';
  $('#f-stockqty').value = (p.stockqty === undefined || p.stockqty === null || p.stockqty === '') ? '' : p.stockqty;
  $('#f-tags').value = p.tags || '';
  updateImagePreview(p.image || '');
  currentExtraImages = String(p.images || '').split(',').map(s => s.trim()).filter(Boolean);
  renderExtraImagesPreview();
  $('#addTabTitle').textContent = `Edit ${p.name || 'product'}`;
  switchTab('add');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm(){
  editingProductId = null;
  $('#f-id').readOnly = false;
  ['f-id','f-name','f-nameHindi','f-category','f-subcategory','f-price','f-mrp','f-costprice','f-image','f-description','f-stockqty','f-tags']
    .forEach(id => $('#' + id).value = '');
  $('#f-stock').value = 'in stock';
  $('#f-imagefile').value = '';
  $('#uploadStatus').textContent = '';
  updateImagePreview('');
  $('#f-extraimagefile').value = '';
  $('#f-extraimageurl').value = '';
  $('#extraUploadStatus').textContent = '';
  currentExtraImages = [];
  renderExtraImagesPreview();
  $('#addTabTitle').textContent = 'Add a product';
  $('#saveStatus').textContent = '';
}

// Shared upload helper — both the main photo and the additional-photos
// section use this, so there's exactly one place that talks to Cloudinary.
async function uploadFileToCloudinary(file){
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET){
    throw new Error('Image hosting isn\'t set up yet — see SETUP-GUIDE.md, or paste an image URL instead.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
}

async function uploadImage(){
  const statusEl = $('#uploadStatus');
  const fileInput = $('#f-imagefile');
  const file = fileInput.files[0];
  if (!file){
    status(statusEl, 'Choose a photo first.', false);
    return;
  }
  status(statusEl, 'Uploading…', true);
  try{
    const url = await uploadFileToCloudinary(file);
    $('#f-image').value = url;
    updateImagePreview(url);
    status(statusEl, 'Photo uploaded.', true);
    fileInput.value = '';
  } catch(err){
    status(statusEl, 'Upload failed: ' + err.message, false);
  }
}

function updateImagePreview(url){
  const box = $('#imgPreview');
  box.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="preview">` : '';
}

/* ---------------- Additional photos (gallery) ---------------- */
let currentExtraImages = [];

function renderExtraImagesPreview(){
  const box = $('#extraImagesPreview');
  box.innerHTML = currentExtraImages.map((url, i) => `
    <div class="extra-thumb">
      <img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async">
      <button type="button" data-i="${i}" aria-label="Remove photo">✕</button>
    </div>
  `).join('');
  $$('.extra-thumb button', box).forEach(btn => btn.addEventListener('click', () => {
    currentExtraImages.splice(Number(btn.dataset.i), 1);
    renderExtraImagesPreview();
  }));
}

async function uploadExtraImage(){
  const statusEl = $('#extraUploadStatus');
  const fileInput = $('#f-extraimagefile');
  const file = fileInput.files[0];
  if (!file){
    status(statusEl, 'Choose a photo first.', false);
    return;
  }
  status(statusEl, 'Uploading…', true);
  try{
    const url = await uploadFileToCloudinary(file);
    currentExtraImages.push(url);
    renderExtraImagesPreview();
    status(statusEl, 'Photo added.', true);
    fileInput.value = '';
  } catch(err){
    status(statusEl, 'Upload failed: ' + err.message, false);
  }
}

function addExtraImageUrl(){
  const input = $('#f-extraimageurl');
  const url = input.value.trim();
  if (!url) return;
  currentExtraImages.push(url);
  renderExtraImagesPreview();
  input.value = '';
}

async function saveProduct(){
  const statusEl = $('#saveStatus');
  const stockqty = $('#f-stockqty').value.trim() === '' ? '' : Number($('#f-stockqty').value);
  const product = {
    id: $('#f-id').value.trim(),
    name: $('#f-name').value.trim(),
    namehindi: $('#f-nameHindi').value.trim(),
    category: $('#f-category').value.trim() || 'Other',
    subcategory: $('#f-subcategory').value.trim() || 'General',
    price: Number($('#f-price').value) || 0,
    mrp: Number($('#f-mrp').value) || Number($('#f-price').value) || 0,
    costprice: $('#f-costprice').value.trim() === '' ? '' : Number($('#f-costprice').value),
    image: $('#f-image').value.trim(),
    images: currentExtraImages.join(','),
    description: $('#f-description').value.trim(),
    // If you've set stock quantity tracking and it's hit zero, keep the plain
    // stock column in sync automatically rather than leaving it saying "in
    // stock" — same thing the backend does when an order brings it to zero.
    stock: (stockqty === 0) ? 'out of stock' : $('#f-stock').value,
    stockqty,
    tags: $('#f-tags').value.trim()
  };
  if (!product.name){
    status(statusEl, 'Product name is required.', false);
    return;
  }

  const isUpdate = !!editingProductId;

  // Only relevant when adding a new product — editing an existing one keeps
  // its ID locked (the field is read-only during edit) so this situation
  // can't arise from that path.
  if (!isUpdate && product.id && PRODUCTS.some(p => String(p.id) === product.id)){
    status(statusEl, `Product ID "${product.id}" is already in use — leave it blank to auto-generate one, or choose a different ID.`, false);
    return;
  }

  const payload = {
    key: ADMIN_KEY,
    action: isUpdate ? 'update' : 'add',
    product
  };
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight against Apps Script
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    status(statusEl, isUpdate ? 'Product updated.' : `Product added as ${data.id}.`, true);
    showToast(isUpdate ? 'Product updated' : 'Product added');
    clearForm();
    await loadProducts();
    switchTab('products');
  } catch(err){
    status(statusEl, 'Save failed: ' + err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save product';
  }
}

async function deleteProduct(id, name){
  if (!confirm(`Delete "${name || id}"? This cannot be undone.`)) return;
  try{
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: ADMIN_KEY, action: 'delete', id })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Product deleted');
    await loadProducts();
  } catch(err){
    alert('Delete failed: ' + err.message);
  }
}

function switchTab(name){
  $$('.admin-tab').forEach(el => el.classList.toggle('active', el.id === 'tab-' + name));
  $$('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  if (name === 'dashboard' && LAST_DASHBOARD) renderDashboard(LAST_DASHBOARD);
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---------------- Dashboard ---------------- */
let LAST_DASHBOARD = null;

function animateNumber(el, target, prefix){
  if (!el) return;
  const duration = 500, start = performance.now();
  const from = Number(String(el.textContent || '0').replace(/[^0-9.-]/g,'')) || 0;
  function step(now){ const p=Math.min(1,(now-start)/duration), eased=1-Math.pow(1-p,3), value=Math.round(from+(target-from)*eased); el.textContent=(prefix||'')+value.toLocaleString('en-IN'); if(p<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}

async function loadDashboard(){
  try{
    const data = await adminRead('adminDashboard');
    LAST_DASHBOARD = data; renderDashboard(data);
  } catch(err){ $('#dashTopProducts').innerHTML=`<p class="hint">Could not load dashboard: ${escapeHtml(err.message)}</p>`; }
}

function moneyShort(n){ return '₹'+Math.round(Number(n)||0).toLocaleString('en-IN'); }
function orderDate(v){ const d=new Date(v); return isNaN(d.getTime()) ? null : d; }
function recentOrders(){ return (ORDERS||[]).slice().sort((a,b)=>(orderDate(b.date)?.getTime()||0)-(orderDate(a.date)?.getTime()||0)); }
function buildSevenDaySales(){
  const days=[]; const now=new Date(); now.setHours(0,0,0,0);
  for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); days.push({key:d.toDateString(),label:d.toLocaleDateString('en-IN',{weekday:'short'}),total:0}); }
  (ORDERS||[]).forEach(o=>{ if((o.status||'Pending')==='Cancelled') return; const d=orderDate(o.date); if(!d) return; const hit=days.find(x=>x.key===new Date(d.getFullYear(),d.getMonth(),d.getDate()).toDateString()); if(hit) hit.total+=Number(o.total)||0; });
  return days;
}
function renderDashboard(d){
  const pending=(d.statusCounts&&d.statusCounts.Pending)||0, monthOrders=Number(d.monthOrders)||0;
  animateNumber($('#statTodayRevenue'),Math.round(d.todayRevenue||0),'₹'); $('#statTodayOrders').textContent=`${d.todayOrders||0} order${d.todayOrders===1?'':'s'} today`;
  animateNumber($('#statMonthRevenue'),Math.round(d.monthRevenue||0),'₹'); $('#statMonthOrders').textContent=`${monthOrders} order${monthOrders===1?'':'s'} this month`;
  animateNumber($('#statMonthProfit'),Math.round(d.monthProfit||0),'₹');
  const avg=monthOrders ? (Number(d.monthRevenue)||0)/monthOrders : 0; animateNumber($('#statAverageOrder'),Math.round(avg),'₹'); $('#statPending').textContent=`${pending} pending${pending===1?'':' orders'}`;
  $('#dashGreetingSub').textContent = pending ? `${pending} order${pending===1?'':'s'} need${pending===1?'s':''} your attention.` : 'Everything looks under control today.';

  const attention=[]; if(pending) attention.push({icon:'⏳',title:`${pending} pending order${pending===1?'':'s'}`,sub:'Open orders and update their status',action:'pending'});
  const critical=(d.lowStock||[]).filter(p=>Number(p.qty)<=2).length; if(critical) attention.push({icon:'📦',title:`${critical} product${critical===1?'':'s'} critically low`,sub:'Stock is at 2 or below',action:'products'});
  $('#dashAttention').innerHTML=attention.map(a=>`<button class="dash-alert" data-dash-action="${a.action}"><span class="alert-icon">${a.icon}</span><span class="alert-copy"><strong>${a.title}</strong><small>${a.sub}</small></span><span class="alert-arrow">›</span></button>`).join('');

  const top=d.topProducts||[], max=Math.max(1,...top.map(p=>Number(p.revenue)||0));
  $('#dashTopProducts').innerHTML=top.length?top.map((p,i)=>`<div class="dash-product-row"><span class="dash-rank">${i+1}</span><div class="dash-product-name"><strong>${escapeHtml(p.name||'(unknown)')}</strong><div class="dash-product-meta">${Number(p.qty)||0} sold</div></div><div class="dash-product-bar-track"><div class="dash-product-bar-fill" style="width:${Math.round((Number(p.revenue)||0)/max*100)}%"></div></div><div class="dash-product-value">${moneyShort(p.revenue)}</div></div>`).join(''):'<p class="hint">No sales recorded yet this month.</p>';

  const sc=d.statusCounts||{}, total=(sc.Pending||0)+(sc.Fulfilled||0)+(sc.Cancelled||0);
  if(!total){$('#dashStatusBar').style.display='none';$('#dashStatusLegend').innerHTML='';$('#dashStatusEmpty').style.display='block';}
  else { $('#dashStatusBar').style.display='flex';$('#dashStatusEmpty').style.display='none'; $('#dashStatusBar').innerHTML=['Pending','Fulfilled','Cancelled'].map(s=>{const c=sc[s]||0;if(!c)return '';return `<div class="dash-status-seg ${s.toLowerCase()}" style="width:${(c/total*100)}%">${c}</div>`;}).join(''); $('#dashStatusLegend').innerHTML=['Pending','Fulfilled','Cancelled'].map(s=>`<span class="dash-legend"><b>${sc[s]||0}</b> ${s}</span>`).join(''); }

  const low=d.lowStock||[]; $('#dashLowStock').innerHTML=low.length?low.map(p=>`<div class="dash-lowstock-item"><div><div class="lowstock-name">${escapeHtml(p.name)}</div><div class="lowstock-state">${Number(p.qty)<=2?'Critical — restock soon':'Low stock'}</div></div><span class="qty">${p.qty} left</span></div>`).join(''):'<p class="hint">All tracked products have healthy stock.</p>';

  const recent=recentOrders().slice(0,5); $('#dashRecentOrders').innerHTML=recent.length?recent.map(o=>{const st=o.status||'Pending';return `<div class="dash-recent-row"><div class="dash-recent-icon">🧾</div><div class="dash-recent-copy"><strong>${escapeHtml(o.customername||o.orderid||'Order')}</strong><span>${escapeHtml(o.orderid||'')} · ${escapeHtml(formatDateTime(o.date))}</span></div><div class="dash-recent-total">${moneyShort(o.total)}<br><span class="status-pill ${escapeHtml(st.toLowerCase())}">${escapeHtml(st)}</span></div></div>`;}).join(''):'<p class="hint">No recent orders yet.</p>';

  const days=buildSevenDaySales(), maxDay=Math.max(1,...days.map(x=>x.total)), week=days.reduce((a,x)=>a+x.total,0); $('#dashWeekTotal').textContent=moneyShort(week); $('#dashSalesChart').innerHTML=days.some(x=>x.total)?days.map(x=>`<div class="dash-bar-wrap"><span class="dash-bar-value">${x.total?moneyShort(x.total):''}</span><div class="dash-bar" style="height:${Math.max(6,Math.round(x.total/maxDay*82))}%"></div><span class="dash-bar-label">${x.label}</span></div>`).join(''):'<p class="hint dash-chart-empty">No sales activity in the last 7 days.</p>';

  $$('[data-dash-action]').forEach(btn=>btn.onclick=()=>{const a=btn.dataset.dashAction;if(a==='pending'){switchTab('orders');$('#orderStatusFilter').value='Pending';renderOrderList();}else if(a==='orders')switchTab('orders');else if(a==='products')switchTab('products');});
  $$('.dash-quick[data-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
}

document.addEventListener('DOMContentLoaded', () => {
  $('#apiUrl').value = DEFAULT_API_URL;
  $('#adminKey').focus();

  $$('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('#connectBtn').addEventListener('click', async () => {
    API_URL = $('#apiUrl').value.trim();
    ADMIN_KEY = $('#adminKey').value;
    if (!API_URL){
      status($('#connectStatus'), 'Paste your Apps Script Web App URL first.', false);
      return;
    }
    const btn = $('#connectBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    await loadProducts();
    btn.disabled = false;
    btn.textContent = 'Connect';
  });
  $('#saveBtn').addEventListener('click', saveProduct);
  $('#clearFormBtn').addEventListener('click', clearForm);
  $('#filterInput').addEventListener('input', renderProductList);
  $('#uploadBtn').addEventListener('click', uploadImage);
  $('#uploadExtraBtn').addEventListener('click', uploadExtraImage);
  $('#addExtraUrlBtn').addEventListener('click', addExtraImageUrl);
  $('#f-image').addEventListener('input', (e) => updateImagePreview(e.target.value.trim()));
  $('#orderSort').addEventListener('change', renderOrderList);
  $('#orderStatusFilter').addEventListener('change', renderOrderList);
  $('#orderFilterInput').addEventListener('input', renderOrderList);
  $('#dashRefreshBtn').addEventListener('click', async () => { await Promise.all([loadOrders(), loadDashboard()]); showToast('Dashboard refreshed'); });
});
