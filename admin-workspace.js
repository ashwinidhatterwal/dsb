/* Progressive admin tools. Credentials stay in memory; product drafts stay in this tab. */
let archivePage=0, archiveSequence=0, archivedProducts=[];
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
    $('#f-id').readOnly=!!editingProductId;$('#idLockHint').hidden=!editingProductId;$('#duplicateBtn').hidden=!editingProductId;$('#sizeOptionsField').hidden=!$('#f-hasSizes').checked;
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
  $('.live-pill').textContent=profile.name+' · '+profile.role;
  if(profile.role==='viewer'){
    $$('[data-tab="add"]').forEach(el=>el.hidden=true);
    $('#tab-add').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
  }
}
async function adminWrite(action,payload){
  const response=await adminFetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:ADMIN_KEY,clientVersion:7,action,...payload})});
  const data=await response.json();if(data.error||data.success===false)throw new Error(data.error||'Change was not saved.');return data;
}
async function archiveProduct(product){
  if(pendingDeletes.has(product.id))return;
  const archive=product.archived!=='yes';
  if(!confirm(`${archive?'Archive':'Restore'} "${product.name}"? ${archive?'It will be hidden from the shop. Existing order history is kept.':'It will be visible in the shop with its current stock settings.'}`))return;
  pendingDeletes.add(product.id);
  try{await adminWrite('archiveProduct',{id:product.id,archived:archive,expected_revision:product._revision});showToast(archive?'Product archived — restore it from Archived.':'Product restored');await Promise.all([loadProducts(false),loadArchive()]);}
  catch(err){showToast(err.message);}finally{pendingDeletes.delete(product.id);}
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
async function loadArchive(){
  const sequence=++archiveSequence;
  $('#archiveStatus').textContent='Loading archive…';
  $('#archivePrev').disabled=true;$('#archiveNext').disabled=true;
  try{
    const data=await adminRead('adminProductsPage',{archived:true,query:$('#archiveSearch').value.trim(),sort:'id-asc',page:archivePage});
    if(sequence!==archiveSequence)return;
    archivePage=data.page;archivedProducts=data.products;
    $('#archiveStatus').textContent=`${data.total} archived products`;
    $('#archiveList').innerHTML=data.products.length?data.products.map(p=>`<div class="archive-card"><img src="${escapeHtml(p.image||'')}" alt="" loading="lazy"><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.id)} · ${escapeHtml(p.category)} · ₹${Number(p.price)||0}</small></div><div class="archive-actions"><button class="ghost-btn" data-restore="${escapeHtml(p.id)}" ${ADMIN_PROFILE?.role==='viewer'?'disabled':''}>Restore</button>${ADMIN_PROFILE?.role==='admin'?`<button class="ghost-btn archive-delete" data-delete="${escapeHtml(p.id)}">Delete permanently</button>`:''}</div></div>`).join(''):'<p class="hint">No archived products.</p>';
    $('#archivePage').textContent=`${archivePage+1} / ${Math.max(1,Math.ceil(data.total/40))}`;
    $('#archivePrev').disabled=archivePage===0;$('#archiveNext').disabled=(archivePage+1)*40>=data.total;
  }catch(err){if(sequence===archiveSequence)$('#archiveStatus').textContent=err.message;}
}
async function permanentlyDeleteProduct(product){
  if(pendingDeletes.has(product.id))return;
  const typed=prompt(`Permanently delete "${product.name}"? This cannot be undone. Existing order records stay. Type ${product.id} to confirm.`);
  if(typed!==String(product.id))return;
  pendingDeletes.add(product.id);
  try{await adminWrite('delete',{id:product.id,expected_revision:product._revision});showToast('Product permanently deleted');await Promise.all([loadArchive(),loadProducts(false)]);}
  catch(err){$('#archiveStatus').textContent=err.message;}finally{pendingDeletes.delete(product.id);}
}
document.addEventListener('DOMContentLoaded',()=>{
  cleanEditor=editorFingerprint();
  ['productCategory','productStock','productSort'].forEach(id=>$('#'+id).addEventListener('change',()=>loadProducts(false)));
  $('#tab-add').addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,300);});
  $('#tab-add').addEventListener('change',persistDraft);
  // Gallery edits are rendered in place rather than firing input events.
  new MutationObserver(()=>{clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,300);}).observe($('#extraImagesPreview'),{childList:true});
  window.addEventListener('beforeunload',e=>{if(editorDirty()||editorBusy){persistDraft();e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  let archiveSearchTimer;
  $('#archiveSearch').oninput=()=>{clearTimeout(archiveSearchTimer);archiveSearchTimer=setTimeout(()=>{archivePage=0;loadArchive();},250);};
  $('#archiveRefresh').onclick=loadArchive;
  $('#archivePrev').onclick=()=>{archivePage=Math.max(0,archivePage-1);loadArchive();};
  $('#archiveNext').onclick=()=>{archivePage++;loadArchive();};
  $('#archiveList').onclick=e=>{const button=e.target.closest('button');if(!button||button.disabled)return;const id=button.dataset.restore||button.dataset.delete;const product=archivedProducts.find(p=>String(p.id)===id);if(!product)return;if(button.dataset.restore)archiveProduct(product);else permanentlyDeleteProduct(product);};
  $('#signOutBtn').onclick=()=>{if(editorBusy)return showToast('Wait for the current operation to finish.');if(editorDirty()&&!confirm('Sign out? Your draft will remain in this tab for this staff key.'))return;persistDraft();cleanEditor=editorFingerprint();ADMIN_KEY='';$('#adminKey').value='';location.reload();};
});
