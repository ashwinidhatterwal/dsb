import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL('../'+name, import.meta.url),'utf8');
const backend=vm.createContext({console});
vm.runInContext(read('code.gs'),backend);
const order={customerName:'Test',phone:'09876543210',address:'Test address',pinCode:'110001',itemsDetail:[{id:'P',qty:1}]};
assert.equal(backend.normalizeAndValidateOrder_(order).ok,true);
for(const phone of ['0000000000','000000000000000','123','']) assert.equal(backend.normalizeAndValidateOrder_({...order,phone}).code,'validation_failed');
// Model Sheets' user-entered numeric coercion and apostrophe text escape.
const sheetValue=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):/^\d+$/.test(v)?Number(v):v;
const heads=['orderid','phone','customername'];
for(const phone of ['09876543210','9876543210','919876543210']) {
  const stored=backend.orderSheetRow_(heads,{orderid:'TEST',phone,customername:'Test'}).map(sheetValue);
  assert.equal(stored[1],phone);
  const sheet={getLastRow:()=>2,getLastColumn:()=>3,getRange:()=>({createTextFinder:()=>({matchEntireCell(){return this;},findNext:()=>({getRow:()=>2})}),getValues:()=>[stored]})};
  backend.getSheet_=()=>sheet;backend.headers_=()=>heads;
  assert.equal(backend.findCustomerOrder_('TEST','9876543210').orderid,'TEST');
  assert.equal(backend.findCustomerOrder_('TEST','9876543211'),null);
}
assert.equal(backend.cleanPhone_(0),'0');
const front=vm.createContext({});
const checkout=read('cart-ui-checkout.js');
vm.runInContext(checkout.slice(checkout.indexOf('function validateCheckoutDetails'),checkout.indexOf('async function submitOrder')),front);
assert.equal(front.validateCheckoutDetails({...order,phone:'0000000000'}).field,'custPhone');
assert.equal(front.validateCheckoutDetails(order),null);
backend.getAllProducts=()=>[{id:'A',name:'Alpha',costprice:123,description:'large',archived:'no'},{id:'B',archived:'yes'}];
assert.equal(JSON.stringify(backend.dispatchAdmin_({action:'adminProducts',options:{linkPicker:true}},{role:'viewer'})),JSON.stringify([{id:'A',name:'Alpha'}]));
assert.equal(backend.dispatchAdmin_({action:'adminProducts'},{role:'viewer'})[0].costprice,123);
// Simultaneous identical reads share a request, without persisting stale results.
let calls=0,resolveFetch;
const ctx=vm.createContext({API_URL:'https://example.test',ADMIN_KEY:'fixture',AbortController,setTimeout,clearTimeout,fetch:()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});}});
const admin=read('admin.js');
vm.runInContext(admin.slice(admin.indexOf('async function adminFetch'),admin.indexOf('function status(')),ctx);
const a=ctx.adminRead('adminOrders',{page:0}),b=ctx.adminRead('adminOrders',{page:0});
assert.equal(calls,1);resolveFetch({ok:true,json:async()=>({orders:[]})});await Promise.all([a,b]);
const c=ctx.adminRead('adminOrders',{page:0});assert.equal(calls,2);resolveFetch({ok:true,json:async()=>({orders:[]})});await c;
ctx.fetch=async()=>{const e=new Error();e.name='AbortError';throw e;};
await assert.rejects(ctx.adminRead('adminOrders'),/Reading data timed out/);
await assert.rejects(ctx.adminFetch('https://example.test',{method:'POST'}),/write may already have saved/);
assert.equal(ctx.adminReadsInFlight,undefined); // Internal cache is not exported.
console.log('PASS: phone text round trip, zero rejection, tracking identity, minimal link payload, shared reads and read/write timeout distinction.');
