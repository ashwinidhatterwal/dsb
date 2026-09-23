/* Small shop operations; no public route exposes health, backups or settings. */
var DSB_REQUEST_LOCK_WAIT_MS_ = 0;
function safeShopLink_(value, instagram) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.length > 1000 || !/^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#][^\s<>]*)?$/i.test(url)) throw new Error('Use a valid HTTPS link without credentials.');
  if (instagram && !/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[a-z0-9_-]+\/?(?:\?[^\s<>]*)?$/i.test(url)) throw new Error('Use an Instagram post or reel link.');
  return url;
}
function saveShipment_(body) {
  return withWriteLock_(function () {
    const carrier = String(body.carrier || '').trim(), reference = String(body.reference || '').trim();
    if (carrier.length > 80 || reference.length > 120) throw new Error('Shipment details are too long.');
    const link = safeShopLink_(body.trackingUrl, false);
    const sheet = getSheet_(ORDERS_SHEET), row = findRow_(sheet, 'orderid', String(body.orderId || ''));
    if (!row) throw new Error('Order not found.');
    ['shipmentcarrier','shipmentreference','shipmenturl','shipmentupdatedat'].forEach(k => ensureColumn_(sheet,k));
    const heads = headers_(sheet), stampCol = heads.indexOf('shipmentupdatedat') + 1;
    if (String(sheet.getRange(row,stampCol).getValue() || '') !== String(body.expectedUpdatedAt || '')) throw new Error('Shipment changed. Refresh before saving.');
    const data = { shipmentcarrier:carrier, shipmentreference:reference, shipmenturl:link, shipmentupdatedat:new Date().toISOString() };
    Object.keys(data).forEach(k => sheet.getRange(row,heads.indexOf(k)+1).setValue(sheetText_(data[k])));
    return { success:true };
  });
}
function recordOperationalTiming_(action, elapsed, outcome) {
  if (!['quoteOrder','addOrder','adminDashboard','adminAnalytics'].includes(action) || Math.random() > .2) return;
  try {
    const key = 'dsb.timings.' + action;
    const values = cacheGetJson_(key) || [];
    values.push({ms:Math.max(0,elapsed),wait:DSB_REQUEST_LOCK_WAIT_MS_,ok:!outcome.error && outcome.success !== false,busy:outcome.code === 'busy',at:Date.now()});
    cachePutJson_(key,values.slice(-80),21600);
  } catch (_) {} // Measurements never interrupt an order.
}
function operationalTimingSnapshot_() {
  const result = {};
  ['quoteOrder','addOrder','adminDashboard','adminAnalytics'].forEach(action => {
    const rows = (cacheGetJson_('dsb.timings.'+action) || []).filter(x=> Date.now()-x.at < 21600000);
    const sorted = rows.map(x=>x.ms).sort((a,b)=>a-b), waits=rows.map(x=>x.wait || 0).sort((a,b)=>a-b);
    const percentile = (a,p) => a.length ? a[Math.max(0,Math.ceil(a.length*p)-1)] : null;
    result[action]={samples:rows.length,p50:percentile(sorted,.5),p95:percentile(sorted,.95),lockP95:percentile(waits,.95),errors:rows.filter(x=>!x.ok).length,busy:rows.filter(x=>x.busy).length};
  });
  return result;
}
function adminOperations_() {
  const health = getShopOperationalHealth();
  const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  let outstanding=0, refunded=0, unverifiedOrders=0;
  orders.forEach(o=> {
    if (String(o.paymentstatus || 'Unverified') === 'Refunded') refunded += Number(o.refundedamount === '' || o.refundedamount == null ? o.total : o.refundedamount) || 0;
    if (o.status !== 'Cancelled' && String(o.paymentstatus || 'Unverified') === 'Unverified') {outstanding += Number(o.total)||0;unverifiedOrders++;}
  });
  const props=PropertiesService.getScriptProperties();
  const daily=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AnalyticsDaily');
  const epoch=String(props.getProperty(ANALYTICS_RESET_AT_PROPERTY)||'');
  const dailyRows=daily?rowsAsObjects_(daily).filter(r=>String(r.epoch||'')===epoch).slice(-14):[];
  return {health:health,timings:operationalTimingSnapshot_(),accounting:getDashboardData(),payments:{unverifiedOrders:unverifiedOrders,outstandingUnverified:roundMoney_(outstanding),recordedRefunds:roundMoney_(refunded)},backupAt:props.getProperty('SHOP_BACKUP_AT')||'',daily:dailyRows};
}
// Run in the editor: copies the whole Sheet while application writes are paused.
// Script Properties, deployment versions and external accounts need separate backup.
function backupShopData() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Shop is busy. Retry backup during a quiet period.');
  try {
    recoverTransactions_(); SpreadsheetApp.flush();
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const backup=DriveApp.getFileById(ss.getId()).makeCopy('DSB backup '+new Date().toISOString());
    PropertiesService.getScriptProperties().setProperty('SHOP_BACKUP_AT',new Date().toISOString());
    return {success:true,backupId:backup.getId()};
  } finally {lock.releaseLock();}
}
function setupShopBackups() {
  if (!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='backupShopData')) ScriptApp.newTrigger('backupShopData').timeBased().everyDays(1).atHour(3).create();
  return {success:true};
}
function rebuildShopDailyAnalytics() {
  const epoch=String(PropertiesService.getScriptProperties().getProperty(ANALYTICS_RESET_AT_PROPERTY)||'');
  const tz=Session.getScriptTimeZone(), since=Date.now()-200*86400000, days={};
  rowsAsObjects_(analyticsSheet_()).forEach(row=>{
    const date=new Date(row.date);
    if (isNaN(date) || date>Date.now() || +date<since || epoch && date<new Date(epoch)) return;
    const key=analyticsDateKey_(date,tz), item=days[key]||(days[key]={events:0,visitors:new Set(),sessions:new Set()});
    item.events++; if(row.visitor)item.visitors.add(row.visitor);if(row.session)item.sessions.add(row.session);
  });
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {busy:true};
  try {
    if(String(PropertiesService.getScriptProperties().getProperty(ANALYTICS_RESET_AT_PROPERTY)||'')!==epoch)return {reset:true};
    const ss=SpreadsheetApp.getActiveSpreadsheet();let sheet=ss.getSheetByName('AnalyticsDaily');
    if(!sheet){sheet=ss.insertSheet('AnalyticsDaily');sheet.hideSheet();}
    const rows=[['date','events','dailyVisitors','dailySessions','epoch','generatedAt'],...Object.keys(days).sort().map(key=>[key,days[key].events,days[key].visitors.size,days[key].sessions.size,epoch,new Date()])];
    sheet.getRange(1,1,rows.length,6).setValues(rows);
    if(sheet.getLastRow()>rows.length)sheet.getRange(rows.length+1,1,sheet.getLastRow()-rows.length,6).clearContent();
    return {days:rows.length-1};
  } finally {lock.releaseLock();}
}
function parseSizeStock_(raw, sizes) {
  if (!String(raw || '').trim()) return null;
  const out=Object.create(null);
  String(raw).split(',').forEach(entry=>{
    const parts=entry.trim().split('='), key=String(parts[0]||'').trim(), value=String(parts[1]||'').trim();
    if(parts.length!==2 || !sizes.includes(key) || !/^\d+$/.test(value) || Number(value)>999999 || Object.prototype.hasOwnProperty.call(out,key))throw new Error('Size stock must list each available size once with a whole quantity: S=3, M=0.');
    out[key]=Number(value);
  });
  if(sizes.some(size=>!Object.prototype.hasOwnProperty.call(out,size)))throw new Error('List a quantity for every available size, including zero.');
  return out;
}
function serializeSizeStock_(stock) {return Object.keys(stock).map(size=>size+'='+stock[size]).join(', ');}
