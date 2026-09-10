/* Progressive admin tools. Credentials stay in memory; product drafts stay in this tab. */
const selectedProducts=new Map();
let activityPage=0, activitySequence=0, bulkBusy=false;
let cleanEditor='', draftTimer;
const editorFields=()=>$$('#tab-add input:not([type=file]),#tab-add select,#tab-add textarea');
function editorState(){return editorFields().map(el=>({id:el.id,value:el.type==='checkbox'?el.checked:el.value}));}
function editorFingerprint(){return JSON.stringify([editorState(),currentExtraImages]);}
function editorDirty(){return cleanEditor!==''&&editorFingerprint()!==cleanEditor;}
function draftKey(){return 'dsb_admin_draft_v7:'+API_URL+':'+(ADMIN_PROFILE?.name||'Owner');}
function persistDraft(){
  if(!ADMIN_PROFILE||editorBusy||!editorDirty())return;
  try{sessionStorage.setItem(draftKey(),JSON.stringify({fields:editorState(),images:currentExtraImages,id:editingProductId,snapshot:editingSnapshot,time:Date.now()}));}catch(_){showToast('Draft could not be saved in this browser.');}
}
function offerSavedDraft(){
  if(ADMIN_PROFILE?.role==='viewer')return;
  let draft;try{draft=JSON.parse(sessionStorage.getItem(draftKey())||'null');}catch(_){}
  if(!draft)return;
  const box=$('#draftOffer');box.hidden=false;
  box.innerHTML='<p>A product draft from this tab is available.</p><div class="draft-controls"><button class="ghost-btn" id="restoreDraft">Restore draft</button><button class="ghost-btn" id="discardDraft">Discard draft</button></div>';
  $('#restoreDraft').onclick=()=>{
    if(editorBusy||editorDirty()&&!confirm('Replace the current unsaved form with this draft?'))return;
    cleanEditor=editorFingerprint();
    draft.fields.forEach(x=>{const el=document.getElementById(x.id);if(!el||!el.closest('#tab-add'))return;if(el.type==='checkbox')el.checked=!!x.value;else el.value=x.value;});
    currentExtraImages=Array.isArray(draft.images)?draft.images:[];editingProductId=draft.id;editingSnapshot=draft.snapshot;
    $('#f-id').readOnly=!!editingProductId;$('#sizeOptionsField').hidden=!$('#f-hasSizes').checked;
    $('#addTabTitle').textContent=editingProductId?'Edit restored draft':'Add a product';updateImagePreview($('#f-image').value);renderExtraImagesPreview();box.hidden=true;
    showToast('Draft restored. Saving checks for changes made since it was opened.');
  };
  $('#discardDraft').onclick=()=>{if(confirm('Discard the saved draft?')){sessionStorage.removeItem(draftKey());box.hidden=true;}};
  showToast('A saved product draft is available in Add product.');
}
const originalFillForm=fillForm;
fillForm=function(p){
  if(editorBusy)return showToast('Please wait for the current save or upload.');
  if(editorDirty()&&!confirm('Discard unsaved changes and open this product?'))return;
  originalFillForm(p);cleanEditor=editorFingerprint();sessionStorage.removeItem(draftKey());$('#draftOffer').hidden=true;
};
const originalClearForm=clearForm;
clearForm=function(confirmed=false){
  if(!confirmed&&editorDirty()&&!confirm('Discard unsaved changes?'))return;
  originalClearForm();cleanEditor=editorFingerprint();sessionStorage.removeItem(draftKey());$('#draftOffer').hidden=true;
};
const originalEditorLock=withEditorLock;
withEditorLock=async function(task){
  if(ADMIN_PROFILE?.role==='viewer')return showToast('This staff key is read-only.');
  try{return await originalEditorLock(task);}finally{persistDraft();}
};
function applyStaffRole(){
  const profile=ADMIN_PROFILE;if(!profile)return;
  $('#activityTabBtn').hidden=profile.role!=='admin';
  $('.live-pill').textContent=profile.name+' · '+profile.role;
  if(profile.role==='viewer'){
    $$('[data-tab="add"],.bulk-tools').forEach(el=>el.hidden=true);
    $('#tab-add').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  }
}
async function adminWrite(action,payload){
  const response=await adminFetch(API_URL,{timeoutMs:action==='bulkProducts'?120000:30000,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:ADMIN_KEY,clientVersion:7,action,...payload})});
  const data=await response.json();if(data.error||data.success===false)throw new Error(data.error||'Change was not saved.');if(data.activityWarning)showToast(data.activityWarning);return data;
}
function updateBulkCount(){
  $('#bulkCount').textContent=selectedProducts.size+' selected';$('#bulkApply').disabled=bulkBusy||selectedProducts.size===0||selectedProducts.size>20||ADMIN_PROFILE?.role==='viewer';
  $('#selectPage').checked=PRODUCTS.length>0&&selectedProducts.size===Math.min(20,PRODUCTS.length);
  $('#selectPage').indeterminate=selectedProducts.size>0&&selectedProducts.size<PRODUCTS.length;
  if(ADMIN_PROFILE?.role==='viewer')$$('.arow-actions button').forEach(el=>el.disabled=true);
}
async function archiveProduct(product){
  if(pendingDeletes.has(product.id))return;
  const archive=product.archived!=='yes';
  if(!confirm(`${archive?'Archive':'Restore'} "${product.name}"? ${archive?'It will be hidden from the shop. Existing order history is kept.':'It will be visible in the shop with its current stock settings.'}`))return;
  pendingDeletes.add(product.id);
  try{await adminWrite('archiveProduct',{id:product.id,archived:archive,expected_revision:product._revision});showToast(archive?'Product archived — restore it from Archived.':'Product restored');await loadProducts(false);}
  catch(err){showToast(err.message);}finally{pendingDeletes.delete(product.id);}
}
async function applyBulk(){
  if(bulkBusy||selectedProducts.size===0||selectedProducts.size>20)return;
  const field=$('#bulkField').value,value=Number($('#bulkValue').value);
  if(!$('#bulkValue').value||!Number.isFinite(value)||value<0||(field==='stockqty'&&!Number.isInteger(value))||(field==='price'&&value<=0)){showToast('Enter a valid value; stock must be a whole number.');return;}
  const products=[...selectedProducts.values()];
  const summary=products.map(p=>`${p.name}: ${p[field]??'untracked'} → ${value}`).join('\n');
  if(!confirm(`Set ${field==='price'?'selling price':'stock quantity'} for ${products.length} products?\n\n${summary}`))return;
  bulkBusy=true;updateBulkCount();$('#bulkApply').textContent='Applying…';
  const items=products.map(p=>({id:p.id,[field]:value,expected_revision:p._revision,...(field==='stockqty'?{expected_stockqty:p.stockqty??'',expected_stock:p.stock??'',stock:value===0?'out of stock':p.stock}: {})}));
  try{
    const data=await adminWrite('bulkProducts',{items});
    $('#bulkResults').innerHTML=data.results.map(r=>`<p class="${r.error?'bulk-error':'hint'}">${escapeHtml(r.id)}: ${escapeHtml(r.error||r.activityWarning||'Saved')}</p>`).join('');
    await loadProducts(false);loadDashboard();
  }catch(err){$('#bulkResults').textContent='Batch outcome could not be confirmed. Refresh products before retrying. '+err.message;}
  finally{bulkBusy=false;updateBulkCount();$('#bulkApply').textContent='Review & apply';}
}
function renderPaymentControls(){
  $$('.orow').forEach(row=>{
    const order=ORDERS.find(o=>String(o.orderid)===row.dataset.id);if(!order)return;
    const box=document.createElement('div');box.className='payment-admin';
    const canVerify=ADMIN_PROFILE?.role==='admin';
    box.innerHTML=`<strong>Payment: ${escapeHtml(order.paymentstatus||'Unverified')}</strong><p class="hint">${escapeHtml(order.paymentreference||'No manual verification recorded.')}${order.paymentverifiedby?' · '+escapeHtml(order.paymentverifiedby):''}</p>${canVerify?'<div class="payment-fields"><select aria-label="Payment verification status"><option>Unverified</option><option>Received</option><option>Refunded</option></select><input maxlength="120" aria-label="Transaction reference or verification note" placeholder="Transaction reference / verification note"><button type="button" class="ghost-btn">Save verification</button></div><p class="hint">Check bank/cash records first. This does not charge or refund money.</p>':''}`;
    row.appendChild(box);
    if(ADMIN_PROFILE?.role==='viewer')$$('[data-role]',row).forEach(el=>el.disabled=true);
    if(!canVerify)return;
    $('select',box).value=order.paymentstatus||'Unverified';$('input',box).value=order.paymentreference||'';
    $('button',box).onclick=async()=>{
      const controls=$$('button,select,input',box);controls.forEach(el=>el.disabled=true);
      try{await adminWrite('verifyPayment',{orderId:order.orderid,paymentStatus:$('select',box).value,reference:$('input',box).value,expectedVerifiedAt:order.paymentverifiedat||''});showToast('Payment verification recorded');await loadOrders();}
      catch(err){showToast(err.message);}finally{controls.forEach(el=>el.disabled=false);}
    };
  });
}
async function loadActivity(){
  if(ADMIN_PROFILE?.role!=='admin')return;
  const sequence=++activitySequence;$('#activityList').textContent='Loading activity…';
  try{
    const data=await adminRead('adminActivity',{page:activityPage});if(sequence!==activitySequence)return;
    activityPage=data.page;$('#activityList').innerHTML=data.entries.length?data.entries.map(x=>`<div class="activity-row"><strong>${escapeHtml(x.actor)} · ${escapeHtml(x.action)} · ${escapeHtml(x.outcome)}</strong><div>${escapeHtml(x.target)} · ${escapeHtml(formatDateTime(x.date))}</div><small>${escapeHtml(x.detail)}</small></div>`).join(''):'<p class="hint">No admin activity recorded yet.</p>';
    $('#activityPage').textContent=`Page ${activityPage+1} of ${Math.max(1,Math.ceil(data.total/40))}`;$('#activityPrev').disabled=activityPage===0;$('#activityNext').disabled=(activityPage+1)*40>=data.total;
  }catch(err){if(sequence===activitySequence)$('#activityList').textContent=err.message;}
}
document.addEventListener('DOMContentLoaded',()=>{
  cleanEditor=editorFingerprint();
  ['productCategory','productStock','productSort','showArchived'].forEach(id=>$('#'+id).addEventListener('change',()=>loadProducts(false)));
  $('#tab-add').addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,300);});
  $('#tab-add').addEventListener('change',persistDraft);
  // Gallery edits are rendered in place rather than firing input events.
  new MutationObserver(()=>{clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,300);}).observe($('#extraImagesPreview'),{childList:true});
  window.addEventListener('beforeunload',e=>{if(editorDirty()||editorBusy){persistDraft();e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  $('#selectPage').onchange=e=>{selectedProducts.clear();if(e.target.checked)PRODUCTS.slice(0,20).forEach(p=>selectedProducts.set(String(p.id),p));$$('[data-select]').forEach(el=>el.checked=selectedProducts.has(el.dataset.select));updateBulkCount();};
  $('#bulkApply').onclick=applyBulk;
  $('#activityRefresh').onclick=loadActivity;$('#activityPrev').onclick=()=>{activityPage=Math.max(0,activityPage-1);loadActivity();};$('#activityNext').onclick=()=>{activityPage++;loadActivity();};
  $('#signOutBtn').onclick=()=>{if(editorBusy)return showToast('Wait for the current operation to finish.');if(editorDirty()&&!confirm('Sign out? Your draft will remain in this tab for this staff key.'))return;persistDraft();cleanEditor=editorFingerprint();ADMIN_KEY='';$('#adminKey').value='';location.reload();};
});
