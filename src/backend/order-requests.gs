/* customer order request responsibilities. Bundled into code.gs by scripts/build.mjs. */
function orderRequestSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ORDER_REQUESTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDER_REQUESTS_SHEET);
    sheet.appendRow(['requestId', 'date', 'orderId', 'type', 'message', 'status', 'resolutionNote', 'updatedAt', 'phoneHash']);
  }
  return sheet;
}
function normalizedTrackingPhone_(value) {
  const digits = cleanPhone_(value);
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
}
function findCustomerOrder_(orderId, phone) {
  const id = String(orderId || '').trim();
  const givenPhone = normalizedTrackingPhone_(phone);
  if (!id || !givenPhone) return null;
  const sheet = getSheet_(ORDERS_SHEET), heads = headers_(sheet), idCol = heads.indexOf('orderid');
  if (idCol < 0 || sheet.getLastRow() < 2) return null;
  const hit = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  if (!hit) return null;
  const values = sheet.getRange(hit.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0], order = {};
  heads.forEach((h, i) => order[h] = values[i]);
  const storedPhone = normalizedTrackingPhone_(order.phone);
  if (!storedPhone || storedPhone !== givenPhone) return null;
  return order;
}
function canCustomerRequestCancellation_(status) {
  return ['Pending', 'Confirmed', 'Packed'].indexOf(String(status || 'Pending')) >= 0;
}
function publicOrderRequests_(orderId) {
  let rows = [];
  try { rows = rowsAsObjects_(orderRequestSheet_()); } catch (_) { return []; }
  return rows.filter(r => String(r.orderid || '') === String(orderId || '')).slice(-10).map(r => ({
    requestId: String(r.requestid || ''),
    type: String(r.type || 'support'),
    status: String(r.status || 'Pending'),
    date: r.date,
    updatedAt: r.updatedat || r.date
  }));
}
function submitOrderRequest_(payload) {
  payload = payload || {};
  const orderId = String(payload.orderId || '').trim(), phone = String(payload.phone || '').trim();
  const type = String(payload.type || '').trim().toLowerCase();
  const message = String(payload.message || '').trim().slice(0, 600);
  if (!orderId || !phone || ORDER_REQUEST_TYPES.indexOf(type) < 0) throw new Error('Invalid order request.');
  rateLimit_('order-request:' + hashText_(orderId + ':' + normalizedTrackingPhone_(phone)), 6, 3600);
  const order = findCustomerOrder_(orderId, phone);
  if (!order) return { success: false, error: 'not_found' };
  const currentStatus = String(order.status || 'Pending');
  if (type === 'cancel' && !canCustomerRequestCancellation_(currentStatus)) {
    return { success: false, error: 'cancellation_unavailable', status: currentStatus };
  }
  if (type === 'support' && message.length < 3) return { success: false, error: 'message_required' };
  const sheet = orderRequestSheet_(), existing = rowsAsObjects_(sheet).filter(r => String(r.orderid || '') === orderId && String(r.type || '') === type && String(r.status || 'Pending') === 'Pending');
  if (existing.length) return { success: true, duplicate: true, requestId: String(existing[existing.length - 1].requestid || ''), status: 'Pending' };
  const requestId = 'REQ-' + Utilities.getUuid().slice(0, 8).toUpperCase(), now = new Date();
  sheet.appendRow([sheetText_(requestId), now, sheetText_(orderId), sheetText_(type), sheetText_(message), 'Pending', '', now, hashText_(normalizedTrackingPhone_(phone))]);
  return { success: true, requestId: requestId, status: 'Pending', type: type };
}
function orderRequestsByOrderIds_(ids) {
  const wanted = {};
  (ids || []).forEach(id => wanted[String(id)] = true);
  if (!Object.keys(wanted).length) return {};
  let rows = [];
  try { rows = rowsAsObjects_(orderRequestSheet_()); } catch (_) { return {}; }
  const out = {};
  rows.forEach(r => {
    const id = String(r.orderid || '');
    if (!wanted[id]) return;
    if (!out[id]) out[id] = [];
    out[id].push({
      requestId: String(r.requestid || ''), date: r.date, type: String(r.type || 'support'), message: String(r.message || ''), status: String(r.status || 'Pending'), resolutionNote: String(r.resolutionnote || ''), updatedAt: r.updatedat || r.date
    });
  });
  Object.keys(out).forEach(id => out[id].sort((a, b) => new Date(b.date) - new Date(a.date)));
  return out;
}
function resolveOrderRequest_(body, actor) {
  return withWriteLock_(function () {
    const id = String(body.requestId || '').trim(), status = String(body.requestStatus || '').trim();
    const note = String(body.resolutionNote || '').trim().slice(0, 500);
    if (!id || ['Resolved', 'Rejected'].indexOf(status) < 0) throw new Error('Invalid request resolution.');
    const sheet = orderRequestSheet_(), heads = headers_(sheet), row = findRow_(sheet, 'requestid', id);
    if (!row) throw new Error('Order request not found.');
    const statusCol = heads.indexOf('status') + 1, noteCol = heads.indexOf('resolutionnote') + 1, updatedCol = heads.indexOf('updatedat') + 1;
    if (statusCol < 1 || noteCol < 1 || updatedCol < 1) throw new Error('Order request sheet is incomplete.');
    sheet.getRange(row, statusCol).setValue(status);
    sheet.getRange(row, noteCol).setValue(sheetText_((note || status) + ' — ' + actor.name));
    sheet.getRange(row, updatedCol).setValue(new Date());
    return { success: true, requestId: id, status: status };
  });
}
