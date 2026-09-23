/* Optional shop tools: links are generated locally; health is fetched on demand. */
(() => {
  'use strict';
  const site = 'https://suhagbhandar.in';
  const $t = id => document.getElementById(id);
  function campaignLink(destination, fields) {
    const url=new URL(destination || '/',site);
    if(url.protocol!=='https:' || !['suhagbhandar.in','www.suhagbhandar.in'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Choose a link on suhagbhandar.in.');
    ['source','medium','campaign','content','term'].forEach(key=>{
      const value=String(fields[key]||'').trim();if(value.length>100)throw new Error('Campaign fields must be at most 100 characters.');
      if(['source','medium','campaign'].includes(key)&&!value)throw new Error('Fill source, medium and campaign.');
      if(value)url.searchParams.set('utm_'+key,value);else url.searchParams.delete('utm_'+key);
    });
    return url.href;
  }
  let loaded=false, products=[];
  async function load() {
    if(loaded)return;
    $t('shopToolsStatus').textContent='Loading product selector…';
    try {
      products=(await adminRead('adminProducts', {linkPicker:true})).filter(p=>String(p.archived||'').toLowerCase()!=='yes');
      $t('utmProduct').innerHTML='<option value="">Home / custom shop link</option>'+products.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name||p.id)} · ${escapeHtml(p.id)}</option>`).join('');
      loaded=true;$t('shopToolsStatus').textContent='Choose a product or paste a shop link. Generating links makes no backend request.';
    } catch(e){$t('shopToolsStatus').textContent='Product lookup failed. You can still paste a shop link. '+e.message;}
  }
  function generate() {
    try {
      const fields={};['source','medium','campaign','content','term'].forEach(key=>fields[key]=$t('utm-'+key).value);
      const url=campaignLink($t('utmDestination').value,fields);
      $t('utmOutput').value=url;$t('utmPreview').href=url;$t('utmPreview').hidden=false;
      $t('shopToolsStatus').textContent='Link ready to copy.';
    } catch(e){$t('utmOutput').value='';$t('utmPreview').hidden=true;$t('shopToolsStatus').textContent=e.message;}
  }
  async function health() {
    const output=$t('shopHealth');output.textContent='Loading health…';
    try {
      const d=await adminRead('adminOperations');const h=d.health,p=d.payments;
      output.innerHTML=`<p>Checked ${escapeHtml(h.checkedAt)} · active event rows: ${Number(h.activeAnalyticsRows)||0}</p><p>Pending recoveries: <b>${Number(h.pendingTransactions)||0}</b> · oldest: ${Number(h.oldestPendingHours||0).toFixed(1)} hours</p><p>Pending Telegram: <b>${Number(h.pendingTelegramNotifications)||0}</b> · oldest: ${Number(h.oldestTelegramPendingHours||0).toFixed(1)} hours</p><p>Analytics maintenance: ${h.maintenanceInstalled?'installed':'not installed'} · last run: ${escapeHtml(h.maintenanceAt||'not recorded')}</p><p>${escapeHtml(h.maintenanceError||'No maintenance error recorded.')}</p><p>Last backup: ${escapeHtml(d.backupAt||'not recorded')}</p><p>Unverified payment value: ₹${Number(p.outstandingUnverified).toFixed(2)} (${Number(p.unverifiedOrders)} orders). Recorded refunds: ₹${Number(p.recordedRefunds).toFixed(2)}. These are manual records, not bank reconciliation.</p><p>Profit coverage: ${d.accounting.accountingIncomplete?'Incomplete':'Complete for recorded completed-order lines'} · unknown-cost lines this month: ${Number(d.accounting.unknownCostLines)||0}</p><h3>Recent request samples</h3><p>Best-effort 20% sample, up to 80 responses per action in six hours. Missing samples are not zero latency. Unreturned platform timeouts are not measured.</p><div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Action</th><th>Samples</th><th>p50 ms</th><th>p95 ms</th><th>Lock p95 ms</th><th>Errors / busy</th></tr></thead><tbody>${Object.entries(d.timings).map(([key,v])=>`<tr><td>${escapeHtml(key)}</td><td>${v.samples}</td><td>${v.p50??'—'}</td><td>${v.p95??'—'}</td><td>${v.lockP95??'—'}</td><td>${v.errors} / ${v.busy}</td></tr>`).join('')}</tbody></table></div><details><summary>Daily activity totals</summary><p>Daily unique visitors must not be added to obtain unique visitors over several days. Traffic counts are approximate.</p>${(d.daily||[]).map(row=>`<p>${escapeHtml(String(row.date).slice(0,10))}: ${Number(row.events)} events · ${Number(row.dailyvisitors)} daily visitors</p>`).join('')||'<p>Run daily maintenance to build these totals.</p>'}</details>`;
      try {const response=await fetch('shop-publication.json',{cache:'no-store'});if(!response.ok)throw Error();const meta=await response.json();const text=document.createElement('p');text.textContent='Served build prepared: '+meta.preparedAt+' · catalogue snapshot: '+meta.catalogueAt;output.appendChild(text);if(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(meta.repositoryUrl||'')){const a=document.createElement('a');a.href=meta.repositoryUrl+'/actions/workflows/update-product-sitemap.yml';a.target='_blank';a.rel='noopener';a.textContent='Open publishing workflow to rebuild';output.appendChild(a);}}catch(_){const text=document.createElement('p');text.textContent='Publication metadata unavailable until the next successful GitHub Pages build.';output.appendChild(text);}
    } catch(e){output.textContent='Health could not load: '+e.message;}
  }
  function shipmentHtml(order) {
    const editable=ADMIN_PROFILE?.role!=='viewer';
    return `<details class="order-detail-section"><summary>Shipment</summary><div class="order-detail-body" data-shipment-stamp="${escapeHtml(order.shipmentupdatedat||'')}">${editable?`<label>Carrier<input data-shipment="carrier" maxlength="80" value="${escapeHtml(order.shipmentcarrier||'')}"></label><label>Tracking reference<input data-shipment="reference" maxlength="120" value="${escapeHtml(order.shipmentreference||'')}"></label><label>Tracking link (HTTPS)<input data-shipment="trackingUrl" type="url" maxlength="1000" value="${escapeHtml(order.shipmenturl||'')}"></label><button type="button" class="ghost-btn" data-save-shipment>Save shipment</button>`:`<p>${escapeHtml(order.shipmentcarrier||'')} ${escapeHtml(order.shipmentreference||'')}</p>`}<p role="status" data-shipment-status></p></div></details>`;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $t('utmProduct')?.addEventListener('change',e=>{$t('utmDestination').value=e.target.value?site+'/product.html?id='+encodeURIComponent(e.target.value):site+'/';$t('utmOutput').value='';$t('utmPreview').hidden=true;});
    $t('utmGenerate')?.addEventListener('click',generate);
    $t('utmCopy')?.addEventListener('click',async()=>{generate();const value=$t('utmOutput').value;if(!value)return;try{await navigator.clipboard.writeText(value);$t('shopToolsStatus').textContent='Copied.';}catch(_){$t('utmOutput').focus();$t('utmOutput').select();$t('shopToolsStatus').textContent='Select Copy from your browser.';}});
    $t('healthRefresh')?.addEventListener('click',health);
    document.addEventListener('click',async e=>{const button=e.target.closest('[data-save-shipment]');if(!button)return;const box=button.closest('[data-shipment-stamp]'),row=button.closest('[data-id]'),status=box.querySelector('[data-shipment-status]');button.disabled=true;try{const body={key:ADMIN_KEY,action:'saveShipment',orderId:row.dataset.id,expectedUpdatedAt:box.dataset.shipmentStamp};box.querySelectorAll('[data-shipment]').forEach(el=>body[el.dataset.shipment]=el.value);const res=await adminFetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});const data=await res.json();if(data.error||data.success!==true)throw Error(data.error||'Save failed');await loadOrders();}catch(err){status.textContent=err.message;button.disabled=false;}});
  });
  window.DSBShopTools=Object.freeze({load,health,campaignLink,shipmentHtml});
})();
