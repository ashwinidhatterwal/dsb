import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const backend = read('code.gs');
function dateKey(date, tz) {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date);
  const part = type => p.find(x => x.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function parseDay(key,tz) {
  const target = Date.parse(key+'T00:00:00Z');
  let timestamp = target;
  for(let i=0;i<3;i++) {
    const parts = new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
    const get = type => parts.find(x=>x.type===type).value;
    timestamp += target-Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
  }
  return new Date(timestamp);
}
function report(events=[],orders=[],options={}) {
  const now = options.now || '2026-09-22T12:00:00Z', tz=options.tz || 'Asia/Kolkata';
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return Date.parse(now);} }
  const c=vm.createContext({console,Date:Clock,Session:{getScriptTimeZone:()=>tz},Utilities:{parseDate:parseDay,formatDate:(date,zone,format)=>dateKey(date,zone)},PropertiesService:{getScriptProperties:()=>({getProperty:()=>options.reset || null})}});
  vm.runInContext(backend,c);
  Object.assign(c,{cacheGetChunkedJson_:()=>null,cachePutJson_:()=>{},analyticsSheet_:()=> 'events',getSheet_:name=>name,rowsAsObjects_:name=>name==='events'?events:name==='Orders'?orders:name==='OrderItems'?(options.items||[]):name==='Products'?(options.products||[]):[]});
  return c.getAnalyticsReport_({days:options.days||7});
}
const ev=(visitor,session,event,date='2026-09-22T10:00:00Z',extra={})=>({date,visitor,session,event,...extra});
const order=(visitor,session,status='Pending',extra={})=>({orderid:'O-'+visitor,date:'2026-09-22T11:00:00Z',analyticsvisitor:visitor,analyticssession:session,status,total:100,...extra});
let r=report([ev('v1','s1','page_view')],[order('v1','s1'),order('v2','s2')]);
assert.equal(r.metrics.visitors.value,2);assert.equal(r.metrics.conversion.value,100);assert.equal(r.funnel[0].value,2);assert.equal(r.funnel[4].value,2);
assert.equal(r.series.at(-1).visitors,2);assert.equal(r.series.at(-1).convertedVisitors,2);
r=report([ev('v','s','page_view',undefined,{source:'instagram',campaign:'sale'}),ev('v','s','order_completed',undefined,{value:100,source:'instagram',campaign:'sale'})],[order('v','s','Cancelled')]);
assert.equal(r.metrics.orders.value,0);assert.equal(r.metrics.conversion.value,0);assert.equal(r.campaigns[0].orders,0);assert.equal(r.campaigns[0].orderValue,0);assert.equal(r.series.at(-1).convertedVisitors,0);
// Multiple real orders in one session: count orders separately from converting sessions.
r=report([ev('v','s','page_view',undefined,{campaign:'sale'})],[order('v','s'),order('v','s','Delivered',{orderid:'O2'})]);
assert.equal(r.campaigns[0].orders,2);assert.equal(r.campaigns[0].orderingSessions,1);assert.equal(r.campaigns[0].conversion,100);assert.equal(r.campaigns[0].orderValue,200);
// Legacy/unattributed order still counts as money, never fabricated campaign attribution.
r=report([ev('v','s','order_completed',undefined,{campaign:'sale',value:900})],[order('','','Pending')]);
assert.equal(r.metrics.orders.value,1);assert.equal(r.metrics.revenue.value,100);assert.equal(r.campaigns[0].orderValue,0);assert.equal(r.metrics.conversion.value,0);
// Recovered order with no event history, including a cancelled visitor.
r=report([],[order('v','s')]);assert.equal(r.metrics.orders.value,1);assert.equal(r.metrics.conversion.value,100);
r=report([],[order('v','s','Cancelled')]);assert.equal(r.metrics.visitors.value,1);assert.equal(r.metrics.conversion.value,0);assert.equal(r.sources[0].value,1);
// No assumptions that cart activity followed product views. Rates use intersections.
r=report([ev('v1','s1','product_view'),ev('v2','s2','add_to_cart'),ev('v3','s3','add_to_cart')]);
assert.equal(r.rates.productToCart,0);assert.equal(r.funnel[2].value,2);assert.equal(r.rates.sessionToCart,66.67);
r=report([ev('v','s','product_view'),ev('v','s','add_to_cart'),ev('v','s','begin_checkout')],[order('v','s')]);
for(const key of ['productToCart','cartToCheckout','checkoutToOrder'])assert.equal(r.rates[key],100);
// Boundary dates, future events and reset coverage agree across every aggregation.
for(const tz of ['UTC','Asia/Kolkata','America/New_York']) {
 const now='2026-11-03T12:00:00Z'; // includes a DST transition in New York
 const start=parseDay('2026-10-28',tz),end=parseDay('2026-10-29',tz);
 r=report([ev('outside','s0','page_view',new Date(+start-1).toISOString()),ev('start','s1','page_view',start.toISOString()),ev('next','s2','page_view',end.toISOString()),ev('future','s3','page_view','2026-12-01T00:00:00Z')],[],{now,tz});
 assert.equal(r.metrics.visitors.value,2);assert.equal(r.series.reduce((sum,x)=>sum+x.visitors,0),2);assert.equal(r.series.length,7);assert.equal(r.series[0].key,'2026-10-28');assert.equal(r.series.at(-1).key,'2026-11-03');
}
r=report([ev('old','old','page_view','2026-09-01T00:00:00Z'),ev('new','new','page_view')],[order('old','old','Delivered',{date:'2026-09-01T00:00:00Z'}),order('new','new')],{reset:'2026-09-22T09:00:00Z'});
assert.equal(r.trackingSince,'2026-09-22T09:00:00.000Z');assert.equal(r.metrics.visitors.value,1);assert.equal(r.metrics.orders.value,1);assert.equal(r.comparisonAvailable,false);
// All rankings cover the full population before truncation; response stays bounded.
const events=[];
for(let i=0;i<21;i++)for(let j=0;j<3;j++)events.push(ev(`v${i}-${j}`,`s${i}-${j}`,'product_view',undefined,{productid:'P'+i}));
for(let j=0;j<2;j++)events.push(ev('last'+j,'last'+j,'product_view',undefined,{productid:'P21'}),ev('last'+j,'last'+j,'add_to_cart',undefined,{productid:'P21'}));
r=report(events,[order('last0','last0','Delivered')],{items:[{orderid:'O-last0',productid:'P21',date:'2026-09-22T11:00:00Z',qty:2,linerevenue:200}]});
assert.equal(r.topProducts.length,20);assert.equal(r.productRankings.cartRate[0],'P21');assert.equal(r.productRankings.revenue[0],'P21');assert.equal(r.productRankings.sold[0],'P21');assert(r.productRankingRows.length<=120);
// Browser tracking: execute real classic scripts with lexical globals and no third-party requests.
const storage=()=>{const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(key,value)=>m.set(key,value),removeItem:key=>m.delete(key)};};
const calls=[];const c=vm.createContext({console,localStorage:storage(),sessionStorage:storage(),URL,URLSearchParams,location:{pathname:'/product.html',hostname:'example.test',search:''},document:{addEventListener(){},dispatchEvent(){},documentElement:{clientWidth:390},referrer:''},setTimeout:()=>1,clearTimeout(){},crypto:{randomUUID:()=>String(Math.random())},CustomEvent:function(){}});c.window=c;c.gtag=(...args)=>calls.push(args);
vm.runInContext("let ALL_PRODUCTS=[{id:'P1',name:'Example',category:'Bangles',price:299}];",c);vm.runInContext(read('storefront-analytics.js'),c);
c.DSBAnalytics.track('add_to_cart',{productId:'P1',size:'2.6',unitPrice:329,qty:2,source:'product'});
assert.equal(calls[0][2].value,658);assert.equal(calls[0][2].items[0].item_name,'Example');assert.equal(calls[0][2].items[0].item_category,'Bangles');assert.equal(calls[0][2].items[0].item_variant,'2.6');
const items=[{productId:'P1',unitPrice:329,qty:2}];c.DSBAnalytics.beginCheckout(items,'UPI');c.DSBAnalytics.beginCheckout(items,'UPI');
assert.equal(calls.filter(x=>x[1]==='begin_checkout').length,1);assert.equal(calls.at(-1)[2].value,658);
// Reopening on another page in the same tab must not inflate starts for unchanged items.
vm.runInContext(read('storefront-analytics.js'),c);c.DSBAnalytics.beginCheckout(items,'UPI');assert.equal(calls.filter(x=>x[1]==='begin_checkout').length,1);
c.DSBAnalytics.beginCheckout([{productId:'P1',unitPrice:329,qty:3}],'UPI');assert.equal(calls.filter(x=>x[1]==='begin_checkout').length,2);
const q=JSON.parse(c.localStorage.getItem('dsb_analytics_queue_v3'));
assert(!JSON.stringify(q).includes('item_name'));assert(!read('cart-ui-checkout.js').includes("track('begin_checkout'"));assert(read('cart-ui-drawer.js').includes('DSBAnalytics?.beginCheckout?.'));
// Privacy wording and its Hindi paragraph mapping remain synchronized.
assert(!read('privacy.html').includes("We don't use tracking cookies"));assert(read('privacy.html').includes('Google Analytics'));assert(read('i18n.js').includes('हम आपकी व्यक्तिगत जानकारी नहीं बेचते'));
console.log('PASS: Phase 1 report outputs, calendar/DST/reset boundaries, cancelled and recovered orders, full-population rankings, GA size pricing, checkout start deduplication and privacy translations.');

// Execute admin rendering and its sort/error handlers against a minimal DOM.
// This verifies wiring and output, not browser layout or pixel geometry.
const elements = new Map(), ready = [];
function element(id) {
  if (!elements.has(id)) elements.set(id,{id,value:id==='analyticsRange'?'7':'',hidden:false,disabled:false,textContent:'',innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},scrollIntoView(){}});
  return elements.get(id);
}
let resolveReport;
const ui = vm.createContext({console,API_URL:'https://example.test',ADMIN_KEY:'fixture',ADMIN_PROFILE:{role:'admin'},document:{getElementById:element,addEventListener(type,fn){if(type==='DOMContentLoaded')ready.push(fn);}},adminRead:()=>new Promise(resolve=>{resolveReport=resolve;}),escapeHtml:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),reducedMotion:()=>true});ui.window=ui;
vm.runInContext(read('admin-analytics.js'),ui);ready.forEach(fn=>fn());
const loading=ui.DSBAdminAnalytics.load(true);
assert.equal(element('analyticsRange').disabled,true);resolveReport(r);await loading;
assert.equal(element('analyticsRange').disabled,false);assert.equal(element('analyticsContent').hidden,false);
assert(!element('analyticsFunnel').innerHTML.includes('from previous'));assert(element('analyticsFunnel').innerHTML.includes('of sessions'));
element('analyticsProductSort').listeners.change({target:{value:'cartRate'}});
assert(element('analyticsProducts').innerHTML.indexOf('data-product-id="P21"')>=0);assert.equal((element('analyticsProducts').innerHTML.match(/<tr /g)||[]).length,20);
assert(element('analyticsFresh').textContent.includes('today so far'));
ui.adminRead=async()=>{throw new Error('Fixture connection failure');};await ui.DSBAdminAnalytics.load(true);
assert.equal(element('analyticsRange').disabled,false);assert.equal(element('analyticsRefresh').disabled,false);assert(element('analyticsStatus').textContent.includes('Fixture connection failure'));
// Verify actual cache helpers can round-trip a report beyond the single-item limit.
const cached = new Map(), cache={get:key=>cached.get(key)||null,put:(key,value)=>cached.set(key,value),getAll:keys=>Object.fromEntries(keys.filter(key=>cached.has(key)).map(key=>[key,cached.get(key)])),putAll:values=>Object.entries(values).forEach(([key,value])=>cached.set(key,value)),removeAll:keys=>keys.forEach(key=>cached.delete(key))};
const cacheVM=vm.createContext({CacheService:{getScriptCache:()=>cache}});vm.runInContext(backend,cacheVM);
const large={...r,example:'हिंदी'.repeat(7000)};cacheVM.cachePutJson_('report',large,60);assert(cached.has('report:meta'));assert.equal(JSON.stringify(cacheVM.cacheGetChunkedJson_('report')),JSON.stringify(large));
console.log('PASS: admin analytics rendering, full-list sort wiring, loading/error recovery and chunked report caching (mock DOM; no visual certification).');
