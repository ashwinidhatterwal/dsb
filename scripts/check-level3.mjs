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

assert(requests.includes("requestType === 'cancel' && status === 'Resolved'") && requests.includes("updateOrderStatusUnlocked_(orderId, 'Cancelled')"), 'Approving a cancellation request must cancel the order in the same admin action');
assert(orders.includes('function updateOrderStatusUnlocked_') && orders.includes('return updateOrderStatusUnlocked_(orderId, statusValue)'), 'Order status core must be reusable by request resolution without nested locks');
assert(admin.includes('orderLifecycleHtml') && admin.includes('orderStatusActionsHtml') && admin.includes('Approve & cancel'), 'Admin orders should use explicit lifecycle/actions and clear cancellation approval');

assert(admin.includes('order-compact-row') && admin.includes('data-order-toggle') && admin.includes('order-expanded-panel'), 'Orders should default to compact expandable cards');
assert(admin.includes("'View'") && admin.includes("'Close'"), 'Compact order cards should expose concise View/Close controls');
assert(!admin.includes('What happens next') && !admin.includes('Items & price breakdown') && !admin.includes('Only valid next steps are actionable'), 'Orders UI should avoid verbose legacy copy');
assert(!admin.includes('data-role="statusSelect"') && !admin.includes('function orderStatusOptions'), 'Confusing status dropdown should be removed');
assert(requests.includes('hasPendingCancellationRequest_') && orders.includes('Handle the pending cancellation request before progressing this order.'), 'Pending cancellation must block forward order progress');
console.log('PASS: dedicated order tracking, POST privacy, support/cancellation requests, admin handling and status lifecycle.');
