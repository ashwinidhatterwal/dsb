import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');

const backend = vm.createContext({console});
vm.runInContext(read('code.gs'), backend);
backend.PropertiesService = {getScriptProperties: () => ({getProperty: () => 'test-signing-key'})};
backend.hashText_ = value => createHash('sha256').update(String(value)).digest('hex');
assert.equal(backend.getCheckoutConfig_().codCharge, 0);
for (const price of [100, 499, 700]) {
  const sheets = {productData: [['id','name','price','stock'],['P','Fixture',price,'in stock']]};
  const order = {itemsDetail:[{id:'P',qty:1}],promoCode:''};
  const upi = backend.priceOrder_({...order,paymentMethod:'UPI'}, sheets);
  assert.equal(upi.ok, true);
  assert.equal(upi.quote.codCharge, 0);
  assert.equal(upi.quote.correctedTotal, price + (price < 499 ? 40 : 0));
  assert.equal(backend.normalizeAndValidateOrder_({customerName:'Test User',phone:'9876543210',address:'House 1',pinCode:'110001',paymentMethod:'Cash on Delivery',itemsDetail:[{id:'P',qty:1}]}).code, 'validation_failed');
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
assert.match(ui.html(),/payment-recommended">Only payment method/);
assert.doesNotMatch(ui.html(),/Cash on Delivery|value="COD"|compared with COD/);
assert.match(ui.html(),/₹140\.00/);
ui.c.renderCartDrawer();
assert.match(ui.html(),/value="UPI" checked/,'UPI remains selected after rerender');
assert.match(checkout('').html(),/UPI payment is temporarily unavailable/,'Checkout must be blocked when the required UPI ID is missing');
assert.match(checkout('').html(),/id="orderWaBtn" type="button" disabled/);

// Android already accepts all HTTPS paths for the verified shop host. Keep
// legacy product.html?id=... and generated /products/... URLs in that scope.
const manifest=read('android/app/src/main/AndroidManifest.xml');
const filter=[...manifest.matchAll(/<intent-filter\b[\s\S]*?<\/intent-filter>/g)].map(m=>m[0]).find(f=>f.includes('android:autoVerify="true"'));
assert(filter && filter.includes('android.intent.action.VIEW') && filter.includes('android.intent.category.BROWSABLE'));
assert.match(filter,/android:scheme="https" android:host="suhagbhandar\.in"/);
assert(!/android:path(?:Prefix|Pattern|AdvancedPattern)?=/.test(filter), 'All product URL paths must remain supported');
const links=JSON.parse(read('.well-known/assetlinks.json'));
assert(links.some(x=>x.target?.package_name==='in.suhagbhandar.app.preview'&&x.relation?.includes('delegate_permission/common.handle_all_urls')));
console.log('PASS: UPI-only checkout, server-side COD rejection, no COD surcharge/UI, missing-UPI checkout lockout and product App Links configuration.');
