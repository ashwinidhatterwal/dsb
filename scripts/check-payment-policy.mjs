import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');

const backend = vm.createContext({console});
vm.runInContext(read('code.gs'), backend);
backend.PropertiesService = {getScriptProperties: () => ({getProperty: () => 'test-signing-key'})};
backend.hashText_ = value => createHash('sha256').update(String(value)).digest('hex');
assert.equal(backend.getCheckoutConfig_().codCharge, 50);
for (const price of [100, 499, 700]) {
  const sheets = {productData: [['id','name','price','stock'],['P','Fixture',price,'in stock']]};
  const order = {itemsDetail:[{id:'P',qty:1}],promoCode:''};
  const cod = backend.priceOrder_({...order,paymentMethod:'Cash on Delivery'}, sheets);
  const upi = backend.priceOrder_({...order,paymentMethod:'UPI'}, sheets);
  assert.equal(cod.ok, true); assert.equal(upi.ok, true);
  assert.equal(cod.quote.codCharge, 50);
  assert.equal(upi.quote.codCharge, 0);
  assert.equal(cod.quote.correctedTotal-upi.quote.correctedTotal, 50);
  assert.equal(cod.quote.deliveryCharge, price < 499 ? 40 : 0);
  assert.equal(backend.sameCheckoutQuote_({...cod.quote,codCharge:20,correctedTotal:cod.quote.correctedTotal-30},cod.quote),false,
    'A stale ₹20 COD quote must require review of the new price');
}

function checkout(upiId) {
  let html = '';
  const listeners = new Map();
  const wrap = {contains:()=>false,get innerHTML(){return html;},set innerHTML(value){html=value;}};
  const node = {scrollTop:0,scrollHeight:1000,addEventListener(){}};
  const product = {id:'P',name:'Fixture',price:100,stockQty:null};
  const c = vm.createContext({CONFIG:{UPI_ID:upiId},console,
    localStorage:{getItem:()=>null,setItem(){}},window:{},document:{activeElement:null,getElementById:()=>null},
    $:id=>id==='#cartContent'?wrap:node,
    $$:selector=>selector==='input[name="payMethod"]'?['UPI','COD'].map(value=>({addEventListener:(_event,fn)=>listeners.set(value,fn)})):[],
    CartStore:{getAll:()=>({P:{product,qty:1}}),total:()=>100,count:()=>1},
    lastReceipt:null,cartAdjustmentHtml:()=>'',productImageUrl:()=>'',escapeHtml:String,money:n=>'₹'+Number(n).toFixed(2),
    closeCart(){},forgetSavedCheckoutInfo(){},
    applyPromoCode(){},submitOrder(){},requestAnimationFrame:fn=>fn()
  });
  const core=read('cart-ui-core.js');
  vm.runInContext(core.slice(0,core.indexOf('let lastReceipt')),c);
  vm.runInContext(core.slice(core.indexOf('function computeDiscount('),core.indexOf('/* ---------------- UPI')),c);
  vm.runInContext('checkoutState.feeConfig = '+JSON.stringify(backend.getCheckoutConfig_()),c);
  vm.runInContext(read('cart-ui-drawer.js'),c);
  c.renderCartDrawer();
  return {c,listeners,html:()=>html};
}
const ui=checkout('fixture@upi');
assert.match(ui.html(),/value="UPI" checked/);
assert.match(ui.html(),/payment-recommended">Recommended/);
assert.match(ui.html(),/₹50\.00 extra/);
assert.match(ui.html(),/Save ₹50\.00 compared with COD/);
ui.listeners.get('COD')({target:{value:'COD'}});
assert.match(ui.html(),/value="COD" checked/);
assert.match(ui.html(),/₹190\.00/);
ui.c.renderCartDrawer();
assert.match(ui.html(),/value="COD" checked/, 'Rerender must preserve an explicit payment choice');
assert.match(checkout('').html(),/value="COD" checked/,'A shop with no UPI ID still needs a usable checkout');

// Android already accepts all HTTPS paths for the verified shop host. Keep
// legacy product.html?id=... and generated /products/... URLs in that scope.
const manifest=read('android/app/src/main/AndroidManifest.xml');
const filter=[...manifest.matchAll(/<intent-filter\b[\s\S]*?<\/intent-filter>/g)].map(m=>m[0]).find(f=>f.includes('android:autoVerify="true"'));
assert(filter && filter.includes('android.intent.action.VIEW') && filter.includes('android.intent.category.BROWSABLE'));
assert.match(filter,/android:scheme="https" android:host="suhagbhandar\.in"/);
assert(!/android:path(?:Prefix|Pattern|AdvancedPattern)?=/.test(filter), 'All product URL paths must remain supported');
const links=JSON.parse(read('.well-known/assetlinks.json'));
assert(links.some(x=>x.target?.package_name==='in.suhagbhandar.app.preview'&&x.relation?.includes('delegate_permission/common.handle_all_urls')));
console.log('PASS: authoritative ₹50 COD fee, zero UPI surcharge, default/recommended UPI, COD choice retention, stale-quote protection and product App Links configuration.');
