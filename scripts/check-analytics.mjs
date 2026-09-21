import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
const [html, client, adminClient, backend, sourceBackend, auth, http] = await Promise.all([
  read('admin.html'), read('storefront-analytics.js'), read('admin-analytics.js'), read('code.gs'), read('src/backend/analytics.gs'), read('src/backend/admin-auth.gs'), read('src/backend/http.gs')
]);
assert(html.includes('id="tab-analytics"'), 'Analytics admin view missing');
assert(html.includes('id="adminMoreBtn"') && html.includes('data-tab="analytics"'), 'Three-dot admin menu must link to Analytics');
assert(html.includes('analytics-kpi') || adminClient.includes('analytics-kpi'), 'Clickable KPI tiles missing');
assert(client.includes("action: 'analyticsBatch'"), 'Storefront analytics must batch to backend');
assert(client.includes('FLUSH_SIZE = 12'), 'Analytics should batch rather than request on every event');
assert(client.includes("'delivery_estimate','review_submitted'"), 'Level 2 events must be accepted by analytics');
assert(!/safeKeys[^\n]+['\"]phone['\"]/.test(client), 'Phone must never be an analytics property');
assert(!/safeKeys[^\n]+['\"]orderId['\"]/.test(client), 'Order ID must never be an analytics property');
assert(sourceBackend.includes("sheetText_(analyticsCleanText_"), 'Analytics text must be spreadsheet-formula safe');
assert(sourceBackend.includes('cancelledOrderIds'), 'Cancelled orders must not count as product sales');
assert(http.indexOf("body.action === 'analyticsBatch'") < http.indexOf('authenticateAdmin_'), 'Public analytics batch must be routed before admin auth');
assert(auth.includes("'adminAnalytics'"), 'Analytics report must be admin-readable');
assert(auth.includes('version: 18'), 'Analytics backend version should be 18');
assert(backend.includes('function getAnalyticsReport_'), 'Generated code.gs is missing analytics report');

const context = vm.createContext({ console });
vm.runInContext(backend, context);
const row = context.analyticsEventRow_({ name:'page_view', path:'/x', props:{ trafficSource:'=IMPORTXML("x")', device:'Mobile' } }, 'v', 's', new Date());
assert.equal(row[9][0], "'", 'Formula-like analytics text must be escaped before Sheets');
assert.equal(row[10], 'Mobile');
assert.equal(context.analyticsEventRow_({name:'not_allowed',props:{}},'v','s',new Date()), null);
console.log('PASS: batched anonymous analytics, admin analytics view, privacy guards, formula safety and backend versioning.');
