(() => {
  'use strict';
  const account = window.DSBAccount, el = id => document.getElementById(id), esc = escapeHtml;
  let lang = 'en', addresses = [], orders = [], cursor = null, generation = 0, ordersBusy = null;
  try { lang = localStorage.getItem('dsb_customer_lang') === 'hi' ? 'hi' : 'en'; } catch (_) {}
  const hi = {brandSub:'आपकी पसंद, आपके साथ',shop:'दुकान',eyebrow:'आपका अपना कोना',title:'मेरा खाता',intro:'आपके ऑर्डर और जानकारी — अगली खरीदारी के लिए तैयार।',welcome:'आपका स्वागत है',signinHelp:'पते सेव करने और खाते से किए गए ऑर्डर देखने के लिए साइन इन करें।',loading:'तैयार हो रहा है…',optional:'बिना खाते के भी खरीदारी कर सकते हैं।',continue:'खरीदारी जारी रखें',privacy:'गोपनीयता नीति',signedIn:'आपका खाता',signOut:'साइन आउट',details:'व्यक्तिगत जानकारी',name:'पूरा नाम',phone:'मोबाइल नंबर',saveDetails:'जानकारी सेव करें',addresses:'सेव किए गए पते',add:'जोड़ें',addressTitle:'डिलीवरी का पता',label:'पते का नाम',recipient:'प्राप्तकर्ता का नाम',address:'पूरा पता',pin:'पिन कोड',defaultChoice:'इसे मुख्य पता बनाएँ',saveAddress:'पता सेव करें',cancel:'रद्द करें',orderEyebrow:'हमारी दुकान से आपके घर तक',orders:'मेरे ऑर्डर',refresh:'रीफ़्रेश',orderHelp:'साइन इन करके दिए गए ऑर्डर यहाँ दिखेंगे। पुराने गेस्ट ऑर्डर के लिए ट्रैकिंग इस्तेमाल करें।',track:'गेस्ट ऑर्डर ट्रैक करें',more:'और ऑर्डर दिखाएँ',savedControl:'खाता और सेव किया गया डेटा',deleteHelp:'अपना ग्राहक खाता, सेव किया गया नाम, मोबाइल नंबर और पते हटाएँ। पुराने ऑर्डर दुकान के रिकॉर्ड में रहेंगे, लेकिन हटाए गए खाते से जुड़े नहीं रहेंगे।',deleteSaved:'खाता हटाएँ',help:'मदद चाहिए?',google:'Google से साइन इन करें',unavailable:'साइन इन अभी उपलब्ध नहीं है',emptyOrders:'अभी कोई खाता-लिंक्ड ऑर्डर नहीं है।',emptyAddresses:'अभी कोई पता सेव नहीं है।',edit:'बदलें',remove:'हटाएँ',default:'मुख्य',download:'स्लिप डाउनलोड करें',print:'प्रिंट / PDF सेव करें',delivery:'डिलीवरी और भुगतान',saved:'सेव हो गया।',deleteConfirm:'क्या यह खाता स्थायी रूप से हटाएँ? सेव प्रोफ़ाइल और पते मिट जाएंगे, पुराने ऑर्डर इस खाते से अलग हो जाएंगे और आपको साइन आउट कर दिया जाएगा। दुकान के ऑर्डर रिकॉर्ड सुरक्षित रहेंगे।',addressConfirm:'यह सेव किया गया पता हटाएँ?',deleted:'खाता हटा दिया गया। आप अतिथि के रूप में खरीदारी जारी रख सकते हैं।',error:'कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।',popup:'साइन इन के लिए पॉपअप की अनुमति दें। Instagram जैसे ऐप के अंदर हैं तो Chrome या Safari में यह पेज खोलें।',payment:'भुगतान स्थिति',subtotal:'उप-कुल',discount:'छूट',deliveryFee:'डिलीवरी शुल्क',codFee:'COD शुल्क',slipNote:'ऑर्डर पुष्टि स्लिप भुगतान की रसीद नहीं है।'};
  const en = {google:'Continue with Google',unavailable:'Sign-in is not available yet',emptyOrders:'No account-linked orders yet.',emptyAddresses:'No saved addresses yet.',edit:'Edit',remove:'Delete',default:'Default',download:'Download slip',print:'Print / Save PDF',delivery:'Delivery & payment details',saved:'Saved successfully.',savedControl:'Account & saved data',deleteHelp:'Delete your customer account, saved profile and addresses. Existing store order records are retained but detached from the deleted account.',deleteSaved:'Delete account',deleteConfirm:'Delete this account permanently? Your saved profile and addresses will be removed, linked orders will be detached from this account, and you will be signed out. Store order records are retained.',addressConfirm:'Delete this saved address?',deleted:'Account deleted. You can continue shopping as a guest.',error:'Something went wrong. Please retry.',popup:'Allow the sign-in popup. If you are inside Instagram or another app, open this page in Chrome or Safari.',payment:'Payment status',subtotal:'Subtotal',discount:'Discount',deliveryFee:'Delivery charge',codFee:'COD fee',slipNote:'An order confirmation slip is not proof of payment.'};
  document.querySelectorAll('[data-t]').forEach(node => { if (!en[node.dataset.t]) en[node.dataset.t] = node.textContent; });
  const t = key => (lang === 'hi' ? hi[key] : en[key]) || en[key] || key;
  function message(text) { el('message').textContent = text || ''; el('message').hidden = !text; }
  function translate() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(node => { node.textContent = t(node.dataset.t); });
    el('language').textContent = lang === 'en' ? 'हिन्दी' : 'English';
    renderAddresses(); renderOrders();
  }
  async function run(button, task) {
    button.disabled = true; message('');
    try { await task(); } catch (err) { message(err.code?.includes('popup') || err.code === 'auth/operation-not-supported-in-this-environment' ? t('popup') : err.message || t('error')); }
    finally { button.disabled = false; }
  }
  function renderAddresses() {
    el('addresses').innerHTML = addresses.length ? addresses.map(a => `<article class="address-card"><strong>${esc(a.label)}</strong> ${a.isDefault?`<span class="pill">${t('default')}</span>`:''}<p>${esc(a.name)}<br>${esc(a.address)}<br>${esc(a.pinCode)}<br>${esc(a.phone)}</p><div class="actions"><button data-edit="${esc(a.id)}">${t('edit')}</button><button data-delete="${esc(a.id)}">${t('remove')}</button></div></article>`).join('') : `<p class="muted">${t('emptyAddresses')}</p>`;
    el('newAddress').disabled = addresses.length >= 5;
  }
  function renderOrders() {
    el('orders').innerHTML = orders.length ? orders.map((o,i) => `<article class="order-card"><div class="order-top"><div><h3 class="order-id">${esc(o.orderId)}</h3><div class="order-date">${esc(formatDateTime(o.orderDate))}</div></div><strong class="order-total">${money(o.total)}</strong></div><p><span class="pill">${esc(statusText(o.status))}</span></p><ul class="order-items">${o.items.map(x=>`<li><span>${esc(x.name)}${x.size?' · '+esc(x.size):''} × ${x.qty}</span><strong>${money(x.lineTotal)}</strong></li>`).join('')}</ul><details><summary>${t('delivery')}</summary><p>${esc(o.name)}<br>${esc(o.phone)}<br>${esc(o.address)}</p><p>${esc(o.paymentMethod)} · ${t('payment')}: ${esc(statusText(o.paymentStatus))}</p><p>${t('subtotal')}: ${money(o.subtotal)}<br>${t('discount')}: −${money(o.discount)}<br>${t('deliveryFee')}: ${money(o.deliveryCharge)}<br>${t('codFee')}: ${money(o.codCharge)}</p></details><div class="actions"><button data-slip="${i}">${t('download')}</button><button data-print="${i}">${t('print')}</button></div><p class="muted"><small>${t('slipNote')}</small></p></article>`).join('') : `<p class="empty">${t('emptyOrders')}</p>`;
    el('moreOrders').hidden = cursor == null;
  }
  function statusText(value) {
    const labels = {Pending:'लंबित',Confirmed:'पुष्टि हो गई',Processing:'तैयार हो रहा है',Packed:'पैक किया गया',Shipped:'भेज दिया गया','Out for Delivery':'डिलीवरी के लिए निकला',Delivered:'डिलीवर हो गया',Cancelled:'रद्द',Returned:'वापस आया',Unverified:'अपुष्ट',Paid:'भुगतान प्राप्त'};
    return lang === 'hi' ? labels[value] || value : value;
  }
  async function loadOrders(reset) {
    const g = generation;
    if (ordersBusy === g) return;
    ordersBusy = g;
    el('refreshOrders').disabled = el('moreOrders').disabled = true;
    try {
      const result = await account.request('customer.orders.list',{cursor:reset?null:cursor});
      if (g !== generation) return;
      orders = reset ? result.orders : orders.concat(result.orders); cursor = result.nextCursor; renderOrders();
    } finally { if (ordersBusy === g) { ordersBusy = null; el('refreshOrders').disabled = el('moreOrders').disabled = false; } }
  }
  async function showMember(user) {
    const g = ++generation;
    addresses = []; orders = []; cursor = null; renderAddresses(); renderOrders();
    el('detailsForm').reset(); el('addressForm').reset(); el('addressForm').hidden = true;
    el('memberPanel').hidden = !user; el('signinPanel').hidden = !!user;
    message('');
    if (!user) return;
    el('memberName').textContent = user.displayName || t('title'); el('memberEmail').textContent = user.email || '';
    try {
      const data = await account.getDetails(true);
      if (g !== generation || !data) return;
      addresses = data.addresses; renderAddresses();
      el('detailsForm').elements.name.value = data.profile.name;
      el('detailsForm').elements.phone.value = data.profile.phone;
      await loadOrders(true);
    } catch (err) { if (g === generation) message(err.message); }
  }
  el('language').onclick = () => { lang = lang === 'en' ? 'hi' : 'en'; try {localStorage.setItem('dsb_customer_lang',lang);} catch (_) {} translate(); };
  el('googleSignIn').onclick = () => run(el('googleSignIn'), () => account.signIn());
  el('signOut').onclick = () => run(el('signOut'), () => account.signOut());
  el('detailsForm').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    run(form.querySelector('button'), async () => {await account.request('customer.profile.save',{profile:{name:form.elements.name.value,phone:form.elements.phone.value}});account.invalidate();message(t('saved'));});
  };
  function editAddress(a = {}) {
    const form = el('addressForm'); form.reset();
    ['id','label','name','phone','address','pinCode'].forEach(k => form.elements[k].value = a[k] || '');
    if (!a.id) form.elements.id.value = crypto.randomUUID();
    form.elements.isDefault.checked = !!a.isDefault || !addresses.length; form.hidden = false; form.elements.label.focus();
  }
  el('newAddress').onclick = () => editAddress();
  el('cancelAddress').onclick = () => { el('addressForm').hidden = true; };
  el('addresses').onclick = event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.edit) editAddress(addresses.find(a => a.id === button.dataset.edit));
    if (button.dataset.delete && confirm(t('addressConfirm'))) run(button,async()=>{const result=await account.request('customer.address.delete',{addressId:button.dataset.delete});addresses=result.addresses;account.invalidate();renderAddresses();});
  };
  el('addressForm').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    run(form.querySelector('button'), async () => {
      const address = Object.fromEntries(new FormData(form)); address.isDefault = form.elements.isDefault.checked;
      // A client UUID makes an interrupted creation safe to retry after refreshing.
      const result = await account.request('customer.address.save',{address});
      addresses = result.addresses; account.invalidate(); renderAddresses();form.hidden = true;message(t('saved'));
    });
  };
  el('refreshOrders').onclick = () => run(el('refreshOrders'),()=>loadOrders(true));
  el('moreOrders').onclick = () => run(el('moreOrders'),()=>loadOrders(false));
  el('orders').onclick = event => {const b=event.target.closest('button');if(!b)return;const i=b.dataset.slip ?? b.dataset.print;if(i!=null)downloadReceipt(orders[Number(i)],b.dataset.print!=null);};
  el('deleteAccount').onclick = () => { if(confirm(t('deleteConfirm')))run(el('deleteAccount'),async()=>{await account.deleteAccount();await showMember(null);message(t('deleted'));}); };
  window.addEventListener('dsb:customer-change',e=>showMember(e.detail.user));
  window.addEventListener('dsb:customer-cleared',()=>{el('detailsForm').reset();el('addressForm').reset();addresses=[];orders=[];cursor=null;renderAddresses();renderOrders();});
  // Clear private rendered data before page snapshots, then refresh on browser back.
  window.addEventListener('pagehide',()=>{el('memberPanel').hidden=true;el('detailsForm').reset();el('addressForm').reset();addresses=[];orders=[];renderAddresses();renderOrders();});
  window.addEventListener('pageshow',e=>{if(e.persisted)showMember(account.user);});
  translate();
  if (!account.enabled) { el('googleSignIn').dataset.t='unavailable';translate(); }
  else account.init().then(()=>{el('googleSignIn').dataset.t='google';el('googleSignIn').disabled=false;translate();}).catch(err=>{message(err.message);el('googleSignIn').dataset.t='unavailable';translate();});
})();
