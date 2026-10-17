import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
for(const file of JSON.parse(read('scripts/retired-customer-files.json')))assert(!fs.existsSync(path.join(root,file)),`Retired file remains: ${file}; run node scripts/remove-retired-files.mjs`);
const storefront=fs.readdirSync(root).filter(f=>/\.(html|js|css)$/.test(f));
for(const file of storefront){
  const source=read(file);
  assert(!/DSBAccount|CUSTOMER_ACCOUNTS|data-customer-link|customerAddressSlot|customer-account\.js|profile\.html|firebasejs|customer_auth|DSBAdminCustomers/.test(source),`Customer account integration remains: ${file}`);
  if(file.endsWith('.html'))assert(!/\b(?:sign[ -]?in|sign[ -]?out|my account|customer accounts)\b|साइन इन|मेरा खाता|मेरे खाते/.test(source.toLowerCase()),`Account UI remains: ${file}`);
}
const backend=read('code.gs');
assert(!/customerIdentity_|customerDispatch_|CUSTOMER_FIREBASE|customeruid|customeritems|adminCustomers_|adminCustomerDetail_/.test(backend));
assert(!read('src/build-order.json').includes('src/backend/customers.gs'));
const requests=[];
const c=vm.createContext({CONFIG:{SHEET_API_URL:'https://example.test'},requestJson:async(url,options)=>{requests.push(JSON.parse(options.body));return {success:true};}});
vm.runInContext(read('cart-ui-checkout.js').split('function checkoutOrderFromForm')[0],c);
for(const action of ['quoteOrder','addOrder','orderResult']){
  await c.postCheckout(action,{order:{requestId:'same-request'}});
  assert.equal(requests.at(-1).action,action);
  assert.equal(requests.at(-1).order.requestId,'same-request');
  assert(!('idToken' in requests.at(-1)));
}
// Stale clients may still send an old token. It cannot block guest order creation
// or trigger remote identity lookup; server-side quote/stock validation is retained.
const b=vm.createContext({console});vm.runInContext(backend,b);
let captured;
Object.assign(b,{jsonResponse:x=>x,addOrder:order=>{captured=order;return {success:true,orderId:'GUEST'};},authenticateAdmin_:()=>{throw new Error('Guest order reached admin authentication');}});
const result=b.doPostCore_({postData:{contents:JSON.stringify({action:'addOrder',idToken:'stale-token',order:{requestId:'same-request'}})}});
assert.equal(result.success,true);assert.equal(captured.requestId,'same-request');
// Actual transaction preparation must not create account ownership/snapshot columns.
vm.runInContext(read('src/backend/checkout.gs'),b);
let record;
Object.assign(b,{withWriteLock_:f=>f(),normalizeAndValidateOrder_:()=>({ok:true,customerName:'Guest',phone:'9876543210',address:'Home',paymentMethod:'UPI'}),validRequestId_:()=>true,hashText_:()=> 'hash',transactionSheet_:()=>({}),findRow_:()=>0,getOrderSheets_:()=>({orders:{appendRow:r=>{record=r;}},orderHeads:[]}),priceOrder_:()=>({ok:true,quote:{quoteToken:'quote',correctedTotal:200},priced:{summary:'Item',items:[{name:'Item',qty:1,unitPrice:200,lineTotal:200,costPrice:1}]}}),rateLimit_(){},normalizeOrderAnalytics_:()=>({}),stockPlan_:()=>[],promoPlan_:()=>null,saveTransaction_:()=>1,SpreadsheetApp:{flush(){}},applyStockPlan_(){},orderSheetRow_:(_h,r)=>r,finishTransaction_(){}});
assert.equal(b.addOrder({requestId:'same-request',quoteToken:'quote',uid:'forged',customerUID:'forged'}).success,true);
assert.equal(record.customername,'Guest');assert(!('customeruid' in record));assert(!('customeritems' in record));
assert(read('src/backend/http.gs').includes('authenticateAdmin_(body.key)'),'Shop management must remain protected');
assert(read('admin.html').includes('id="disconnectAdminBtn"') && read('admin-workspace.js').includes("$('#disconnectAdminBtn').onclick"));
console.log('PASS: guest-only checkout with stable request IDs, stale-token compatibility, account code/UI removal, no account ownership writes, and protected admin management.');
