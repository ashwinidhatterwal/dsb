/* Owner-only customer directory. Private reads use the existing authenticated POST helper. */
(() => {
  const el=id=>document.getElementById(id), esc=escapeHtml;
  let page=0, loading=false, generation=0;
  async function load(reset=false) {
    if(loading)return;
    const gen=++generation;
    if(reset)page=0;
    el('customersList').replaceChildren();
    if(!ADMIN_PROFILE || ADMIN_PROFILE.role!=='admin'){el('customersStatus').textContent='Only store administrators can view customer accounts.';return;}
    loading=true;el('customersStatus').textContent='Loading customer accounts…';
    try {
      const result=await adminRead('adminCustomers',{page,query:el('customerSearch').value});
      if(gen!==generation)return;
      if(result.error)throw new Error(result.error);
      el('customersList').innerHTML=result.customers.map(c=>`<article class="admin-customer-card"><h3>${esc(c.name||'Customer')}</h3><p>${esc(c.email)}<br>${esc(c.phone)}</p><p>${c.orderCount} orders · ${c.addressCount} saved addresses · ₹${Number(c.orderValue).toLocaleString('en-IN')} order value</p><button type="button" class="ghost-btn" data-customer-uid="${esc(c.uid)}">View saved details & orders</button><div class="admin-customer-detail" hidden></div></article>`).join('');
      el('customersStatus').textContent=`${result.total} customers · Page ${page+1}`;
      el('customersPrev').disabled=page===0;el('customersNext').disabled=!result.hasMore;
    }catch(e){el('customersStatus').textContent='Could not load customers: '+e.message;}
    finally{loading=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    el('customerSearchForm').onsubmit=e=>{e.preventDefault();load(true);};
    el('customersRefresh').onclick=()=>load(true);
    el('customersPrev').onclick=()=>{if(!loading && page){page--;load();}};
    el('customersNext').onclick=()=>{if(!loading){page++;load();}};
    el('customersList').onclick=async e=>{
      const b=e.target.closest('[data-customer-uid]');if(!b)return;
      const target=b.nextElementSibling;
      if(!target.hidden){target.hidden=true;return;}
      b.disabled=true;
      try {
        const r=await adminRead('adminCustomerDetail',{uid:b.dataset.customerUid});if(r.error)throw new Error(r.error);
        if(ADMIN_PROFILE?.role!=='admin')return;
        target.innerHTML='<h4>Saved addresses</h4>'+ (r.addresses.map(a=>`<p><strong>${esc(a.label)}${a.isDefault?' · Default':''}</strong><br>${esc(a.name)} · ${esc(a.phone)}<br>${esc(a.address)} · ${esc(a.pinCode)}</p>`).join('')||'<p>No saved addresses.</p>')+'<h4>Latest 10 orders</h4>'+ (r.orders.map(o=>`<p><strong>${esc(o.orderId)}</strong> · ${esc(o.status)} · ₹${Number(o.total).toLocaleString('en-IN')}</p>`).join('')||'<p>No linked orders.</p>');target.hidden=false;
      }catch(err){target.textContent=err.message;target.hidden=false;}finally{b.disabled=false;}
    };
    document.getElementById('signOutBtn')?.addEventListener('click',()=>{generation++;el('customersList').replaceChildren();});
  });
  window.DSBAdminCustomers={load};
})();
