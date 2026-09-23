/* Customer convenience API. Identity is verified here; never accept a browser UID. */
function customerIdentity_(token) {
  const project = secret_('CUSTOMER_FIREBASE_PROJECT_ID');
  const key = secret_('CUSTOMER_FIREBASE_API_KEY');
  if (secret_('CUSTOMER_ACCOUNTS_ENABLED') !== 'true' || !project || !key) throw new Error('Customer accounts are unavailable. You can shop as a guest.');
  if (typeof token !== 'string' || token.length > 6000 || token.split('.').length !== 3) throw new Error('Please sign in again.');
  // Online verification is intentional: no hand-written JWT signature verifier or token cache.
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({idToken: token}), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    // Firebase responses can include account details or URLs. Expose only known,
    // non-sensitive error identifiers so the owner can fix the configuration.
    let reason = '';
    try { reason = String(JSON.parse(response.getContentText()).error?.message || ''); } catch (_) {}
    const known = ['API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_INVALID',
      'INVALID_API_KEY', 'INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'PROJECT_NOT_FOUND',
      'CONFIGURATION_NOT_FOUND', 'OPERATION_NOT_ALLOWED'];
    const tag = known.find(code => reason.includes(code)) || 'HTTP_' + response.getResponseCode();
    console.error('Firebase customer authentication failed: ' + tag); // Never log the token or API key.
    throw new Error('Sign-in verification failed (' + tag + '). Please contact the shop or continue as a guest.');
  }
  const user = (JSON.parse(response.getContentText()).users || [])[0];
  // Decode claims only AFTER Google's verification, and enforce this project's identity.
  const claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1])).getDataAsString());
  const now = Math.floor(Date.now() / 1000);
  if (!user || user.disabled || !user.localId || claims.sub !== user.localId || claims.aud !== project ||
      claims.iss !== 'https://securetoken.google.com/' + project || !(claims.exp > now) ||
      !(claims.auth_time > 0 && claims.auth_time <= now + 60) || Number(user.validSince || 0) > claims.auth_time ||
      claims.firebase?.sign_in_provider !== 'google.com') throw new Error('Please sign in again.');
  return {uid: user.localId, email: String(user.email || ''), name: String(user.displayName || ''), authTime: claims.auth_time};
}
function customerSheet_(name, headers, create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet && create) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  return sheet;
}
function customerProfiles_(create) { return customerSheet_('Customers', ['UID','Email','DisplayName','Phone','UpdatedAt'], create); }
function customerAddresses_(create) { return customerSheet_('CustomerAddresses', ['AddressID','UID','RecipientName','Phone','Address','Pincode','Label','IsDefault','UpdatedAt'], create); }
function customerRows_(sheet, uid) { return sheet ? rowsAsObjects_(sheet).filter(r => String(r.uid) === uid) : []; }
function customerProfile_(identity) {
  const p = customerRows_(customerProfiles_(false), identity.uid)[0];
  return {name: p ? String(p.displayname || '') : identity.name, phone: p ? String(p.phone || '') : '', email: identity.email};
}
function customerAddressList_(uid) {
  return customerRows_(customerAddresses_(false), uid).map(a => ({id: String(a.addressid), name: String(a.recipientname), phone: String(a.phone), address: String(a.address), pinCode: String(a.pincode), label: String(a.label), isDefault: String(a.isdefault) === 'yes'}));
}
function customerText_(value, max, min) {
  const s = String(value == null ? '' : value).trim();
  if (s.length > max || s.length < (min || 0)) throw new Error('Please check the saved details and field lengths.');
  return s;
}
function customerPhone_(value, optional) {
  const s = cleanPhone_(value);
  if ((!optional || s) && (!/^\d{10,15}$/.test(s) || /^0+$/.test(s))) throw new Error('Enter a valid mobile number.');
  return s;
}
function customerWrite_(sheet, row, record) {
  const heads = headers_(sheet);
  sheet.getRange(row || sheet.getLastRow() + 1, 1, 1, heads.length).setValues([heads.map(h => {
    const v = record[h] == null ? '' : record[h];
    return h === 'phone' || h === 'pincode' ? "'" + v : sheetText_(v);
  })]);
}
function customerOrders_(uid, cursor) {
  const sheet = getSheet_(ORDERS_SHEET), heads = headers_(sheet), col = heads.indexOf('customeruid');
  if (col < 0 || sheet.getLastRow() < 2) return {orders: [], nextCursor: null};
  const bound = cursor == null ? sheet.getLastRow() + 1 : Number(cursor);
  if (!Number.isInteger(bound) || bound < 2) throw new Error('Invalid order page.');
  // Read the ownership column first, then only the requested customer's 10 rows.
  const matches = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).createTextFinder(uid).matchEntireCell(true).matchCase(true).findAll()
    .map(hit => hit.getRow()).filter(row => row < bound).sort((a,b) => b-a);
  const selected = matches.slice(0,10);
  return {orders: selected.map(row => {
    const values = sheet.getRange(row,1,1,heads.length).getValues()[0], order = {};
    heads.forEach((h,i) => order[h] = values[i]);
    return customerOrderView_(order);
  }), nextCursor: matches.length > 10 ? selected[selected.length-1] : null};
}
function customerOrderView_(o) {
  let items = [];
  try { items = JSON.parse(o.customeritems || '[]'); } catch (_) {}
  // Explicit allowlist: never return internal costs, analytics, journal or admin data.
  return {orderId: String(o.orderid), orderDate: o.date, name: String(o.customername || ''), phone: String(o.phone || ''), address: String(o.address || ''),
    paymentMethod: String(o.paymentmethod || ''), status: String(o.status || 'Pending'), paymentStatus: String(o.paymentstatus || 'Unverified'),
    promoCode: String(o.promocode || ''), discount: Number(o.discount) || 0, deliveryCharge: Number(o.deliverycharge) || 0, codCharge: Number(o.codcharge) || 0,
    total: Number(o.total) || 0, subtotal: (Number(o.total)||0)+(Number(o.discount)||0)-(Number(o.deliverycharge)||0)-(Number(o.codcharge)||0),
    items: Array.isArray(items) ? items.map(x => ({name: String(x.name || ''), size: String(x.size || ''), qty: Number(x.qty)||0, unitPrice: Number(x.unitPrice)||0, lineTotal: Number(x.lineTotal)||0})) : []};
}
function customerDispatch_(body) {
  try {
    const identity = customerIdentity_(body.idToken), uid = identity.uid;
    rateLimit_('customer:' + uid, 90, 600);
    if (body.action === 'customer.profile.get') return {success:true, profile:customerProfile_(identity), addresses:customerAddressList_(uid)};
    if (body.action === 'customer.orders.list') return Object.assign({success:true}, customerOrders_(uid, body.cursor));
    // Customer writes use the same script lock as order placement, without unrelated journal recovery.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return {success:false, error:'The shop is busy. Please retry.'};
    try {
      if (body.action === 'customer.profile.save') {
        const p = body.profile || {}, sheet = customerProfiles_(true);
        customerWrite_(sheet, findRow_(sheet,'uid',uid), {uid, email:identity.email, displayname:customerText_(p.name,100,2), phone:customerPhone_(p.phone,true), updatedat:new Date()});
        return {success:true, profile:customerProfile_(identity)};
      }
      if (body.action === 'customer.address.save') {
        const a = body.address || {}, sheet = customerAddresses_(true), existing = customerAddressList_(uid);
        const id = a.id ? customerText_(a.id,80,1) : Utilities.getUuid();
        const own = existing.find(x => x.id === id);
        if (a.id && !own && (!validRequestId_(id) || findRow_(sheet,'addressid',id))) throw new Error('Address not found.');
        if (!own && existing.length >= 5) throw new Error('You can save up to five addresses.');
        const record = {addressid:id, uid, recipientname:customerText_(a.name,100,2), phone:customerPhone_(a.phone), address:customerText_(a.address,488,5), pincode:customerText_(a.pinCode,6,6), label:customerText_(a.label,30)||'Home', isdefault:(a.isDefault || !existing.length)?'yes':'no', updatedat:new Date()};
        if (!/^[1-9]\d{5}$/.test(record.pincode)) throw new Error('Enter a valid six-digit PIN code.');
        if (record.isdefault === 'yes') existing.filter(x => x.isDefault && x.id !== id).forEach(x => sheet.getRange(findRow_(sheet,'addressid',x.id),headers_(sheet).indexOf('isdefault')+1).setValue('no'));
        customerWrite_(sheet, own ? findRow_(sheet,'addressid',id) : 0, record);
        return {success:true, addresses:customerAddressList_(uid)};
      }
      if (body.action === 'customer.address.delete') {
        const sheet = customerAddresses_(false), own = customerAddressList_(uid).find(a => a.id === body.addressId);
        if (!own) throw new Error('Address not found.');
        sheet.deleteRow(findRow_(sheet,'addressid',own.id));
        return {success:true, addresses:customerAddressList_(uid)};
      }
      if (body.action === 'customer.saved.delete') {
        if (body.confirm !== 'DELETE_SAVED_DETAILS' || Date.now()/1000 - identity.authTime > 300) throw new Error('Sign out and sign in again before deleting saved details.');
        const addresses = customerAddresses_(false);
        customerAddressList_(uid).forEach(a => addresses.deleteRow(findRow_(addresses,'addressid',a.id)));
        const profiles = customerProfiles_(false), row = profiles && findRow_(profiles,'uid',uid);
        if (row) profiles.deleteRow(row);
        return {success:true}; // Order records and sign-in identity are deliberately retained.
      }
      throw new Error('Unknown customer action.');
    } finally { lock.releaseLock(); }
  } catch (err) { return {success:false, code:'customer_error', error:String(err.message || 'Customer service unavailable.')}; }
}
