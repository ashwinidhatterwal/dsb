/* Small shared bridge. Firebase is loaded only on the profile page or when checkout restores account state. */
(() => {
  'use strict';
  const marker = 'dsb_customer_signed_in';
  const enabled = !!CONFIG.CUSTOMER_ACCOUNTS?.enabled;
  let sdk, auth, ready, details, detailsUid, lastUid, loadingDetails;
  const readMarker = () => { try { return localStorage.getItem(marker) === 'yes'; } catch (_) { return false; } };
  const remember = yes => { try { yes ? localStorage.setItem(marker,'yes') : localStorage.removeItem(marker); } catch (_) {} };
  function clearPrivate() {
    details = null; detailsUid = null; loadingDetails = null;
    try { ['dsb_checkout_info_v1','dsb_last_receipt_v2'].forEach(k => localStorage.removeItem(k)); } catch (_) {}
    // Never clear pending checkout: its request ID protects against duplicate orders.
    window.dispatchEvent(new CustomEvent('dsb:customer-cleared'));
  }
  async function init() {
    if (!enabled) return null;
    if (!ready) ready = (async () => {
      const [app, api] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js')
      ]);
      sdk = api; auth = sdk.getAuth(app.initializeApp(CONFIG.CUSTOMER_ACCOUNTS.firebase, 'dsb-customer'));
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      await auth.authStateReady();
      sdk.onAuthStateChanged(auth, user => {
        const next = user?.uid || null;
        if ((lastUid && lastUid !== next) || (!next && readMarker())) clearPrivate();
        lastUid = next; remember(!!next);
        window.dispatchEvent(new CustomEvent('dsb:customer-change', {detail:{user}}));
      });
      return auth;
    })().catch(err => { ready = null; throw err; });
    return ready;
  }
  async function token() {
    if (!enabled || (!auth && !readMarker())) return '';
    await init();
    return auth.currentUser ? auth.currentUser.getIdToken() : '';
  }
  async function request(action, data = {}) {
    await init();
    const user = auth?.currentUser;
    if (!user) throw new Error('Please sign in again. / कृपया फिर से साइन इन करें।');
    const idToken = await user.getIdToken();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(CONFIG.SHEET_API_URL, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...data,action,idToken}),signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error('Customer service unavailable. Please retry. / कृपया फिर कोशिश करें।');
      const result = await response.json();
      if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed. Please reload.');
      if (!result.success) throw new Error(result.error || 'Please retry.');
      return result;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The request timed out. Refresh before repeating a change. / बदलाव दोहराने से पहले रीफ़्रेश करें।');
      throw e;
    } finally { clearTimeout(timer); }
  }
  async function getDetails(force = false) {
    await init();
    const uid = auth?.currentUser?.uid;
    if (!uid) return null;
    if (!force && details && detailsUid === uid) return details;
    if (!loadingDetails) loadingDetails = request('customer.profile.get').then(result => {
      if (auth.currentUser?.uid === uid) { details = result; detailsUid = uid; }
      return result;
    }).finally(() => { loadingDetails = null; });
    return loadingDetails;
  }
  window.DSBAccount = {
    enabled, init, request, getDetails, token,
    get user() { return auth?.currentUser || null; },
    get returning() { return enabled && readMarker(); },
    // init completes before enabling the sign-in button, preserving the browser user gesture.
    signIn() { const provider = new sdk.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'}); return sdk.signInWithPopup(auth,provider); },
    async signOut() { await init(); await sdk.signOut(auth); remember(false); clearPrivate(); },
    async deleteAccount() {
      await init();
      const user = auth?.currentUser;
      if (!user) throw new Error('Please sign in again. / कृपया फिर से साइन इन करें।');
      await request('customer.account.delete', {confirm:'DELETE_ACCOUNT'});
      remember(false); clearPrivate();
      try {
        await sdk.deleteUser(user);
      } catch (err) {
        try { await sdk.signOut(auth); } catch (_) {}
        const e = new Error('Your saved account data was deleted and you were signed out, but the sign-in identity could not be removed. Sign in again and retry account deletion.');
        e.code = 'customer/auth-delete-incomplete';
        throw e;
      }
    },
    clearPrivate,
    invalidate() { details = null; try {localStorage.setItem('dsb_customer_details_changed',String(Date.now()));} catch (_) {} }
  };
  window.addEventListener('storage',event=>{if(event.key==='dsb_customer_details_changed'){details=null;window.dispatchEvent(new CustomEvent('dsb:customer-details-changed'));}});
  window.addEventListener('storage', event => { if (event.key === marker && event.newValue !== 'yes') clearPrivate(); });
  document.querySelectorAll('[data-customer-link]').forEach(a => { a.hidden = !enabled; });
})();
