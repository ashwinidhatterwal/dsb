import fs from 'node:fs';
function read(name){return fs.readFileSync(new URL('../'+name, import.meta.url),'utf8')}
function assert(ok,msg){if(!ok) throw new Error(msg)}
const requests=read('src/backend/order-requests.gs'), http=read('src/backend/http.gs'), orders=read('src/backend/orders.gs');
const core=read('cart-ui-core.js'), drawer=read('cart-ui-drawer.js'), admin=read('admin.js'), page=read('track-order.html'), track=read('track-order.js');
new Function(track);
for (const name of ['index.html','catalog.html','about.html','privacy.html','product.html','returns.html','contact.html']) {
  const html=read(name);
  assert(html.includes('href="track-order.html"'), `${name}: dedicated tracking link missing`);
  assert(!html.includes('id="trackOverlay"'), `${name}: legacy tracking overlay still present`);
}
assert(requests.includes('phoneHash') && !requests.includes("sheetText_(phone)"), 'OrderRequests must not duplicate raw phone');
assert(http.includes("body.action === 'trackOrder'") && http.includes("body.action === 'submitOrderRequest'"), 'Public POST routes missing');
assert(!http.includes("e.parameter.orderId") && !http.includes("e.parameter.phone"), 'GET tracking route should be removed to keep phone out of URLs');
assert(track.includes("method: 'POST'") && track.includes("action: 'trackOrder'") && !track.includes('?action=trackOrder&orderId='), 'Dedicated tracker must use POST');
assert(page.includes('id="trackPageForm"') && page.includes('track-order.js'), 'Dedicated tracking page missing');
assert(core.includes('track-order.html?orderId=') && !core.includes('function openTrackOrder'), 'Cart core should navigate to dedicated tracker only');
assert(drawer.includes('goToTrackOrder(orderId)'), 'Order confirmation must open dedicated tracker');
assert(orders.includes('Invalid status transition from') && orders.includes('orderRequestsByOrderIds_'), 'Order lifecycle/request admin feed missing');
assert(admin.includes('ORDER_STATUS_TRANSITIONS_CLIENT') && admin.includes('orderRequestsHtml') && admin.includes('resolveOrderRequest'), 'Admin Level 3 controls missing');
console.log('PASS: dedicated order tracking, POST privacy, support/cancellation requests, admin handling and status lifecycle.');
