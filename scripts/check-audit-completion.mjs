import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c=vm.createContext({console,Date});vm.runInContext(fs.readFileSync('code.gs','utf8'),c);
class Sheet {
 constructor(data){this.data=data.map(r=>[...r]);}
 getDataRange(){return {getValues:()=>this.data.map(r=>[...r])};}
 getLastRow(){return this.data.length;}getLastColumn(){return this.data[0].length;}
 getRange(r,col,n=1,w=1){const s=this;return {getValue:()=>s.data[r-1]?.[col-1]??'',getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>s.data[r+i-1]?.[col+j-1]??'')),setValue:v=>{s.data[r-1]??=[];s.data[r-1][col-1]=v;},setValues:rows=>rows.forEach((row,i)=>row.forEach((v,j)=>{s.data[r+i-1]??=[];s.data[r+i-1][col+j-1]=v;}))};}
}
const product=new Sheet([['id','name','price','sizes','sizeprices','stockqty','stock','sizestock'],['P','Example',100,'S,M','S=100,M=120',3,'in stock','S=1, M=2']]);
const heads=product.data[0];
const orderItems=[{id:'P',size:'S',qty:1},{id:'P',size:'M',qty:1}];
const validated=c.buildValidatedOrderItems_(orderItems,product.data);assert.equal(validated.ok,true);assert.equal(validated.subtotal,220);
assert.equal(c.buildValidatedOrderItems_([{id:'P',size:'S',qty:2}],product.data).ok,false);
assert.equal(c.buildValidatedOrderItems_([{id:'P',size:'S',qty:1},{id:'P',size:'S',qty:1}],product.data).ok,false);
const sheets={productSheet:product,productData:product.data,productHeads:heads};
const plan=c.stockPlan_(validated.items,sheets);assert.equal(plan.length,1);assert.equal(plan[0].afterSizeStock,'S=0, M=1');
c.applyStockPlan_(plan,true,sheets);assert.equal(product.data[1][5],1);assert.equal(product.data[1][7],'S=0, M=1');
c.applyStockPlan_(plan,true,sheets);assert.equal(product.data[1][5],1,'recovery writes absolute quantities');
c.applyStockPlan_(plan,false,sheets);assert.equal(product.data[1][5],3);assert.equal(product.data[1][7],'S=1, M=2');
c.applyStockPlan_(plan,true,sheets);
Object.assign(c,{getSheet_:()=>product,getOrderItemQuantities_:()=>orderItems});
const cancel=c.statusStockPlan_('O','Pending','Cancelled');assert.equal(cancel.length,1);assert.equal(cancel[0].afterQty,3);assert.equal(cancel[0].afterSizeStock,'S=1, M=2');
c.applyStockPlan_(cancel,true,sheets);
const resume=c.statusStockPlan_('O','Cancelled','Pending');assert.equal(resume[0].afterSizeStock,'S=0, M=1');
c.applyStockPlan_(resume,true,sheets);assert.throws(()=>c.statusStockPlan_('O','Cancelled','Pending'),/Insufficient/);
assert.throws(()=>c.parseSizeStock_('S=1,S=2',['S','M']));assert.throws(()=>c.parseSizeStock_('S=1',['S','M']));assert.equal(c.parseSizeStock_('',['S','M']),null);
c.secret_=()=>'';
const owner={role:'admin',name:'Owner'},viewer={role:'viewer',name:'Report'};
assert.equal(c.dispatchAdmin_({action:'adminSession',options:{requiredVersion:26}},owner).version,26);
assert.throws(()=>c.assertAdminPermission_(viewer,'saveShipment'));
const orders=new Sheet([['orderid','shipmentcarrier','shipmentreference','shipmenturl','shipmentupdatedat'],['O','','','','']]);
Object.assign(c,{getSheet_:()=>orders,withWriteLock_:fn=>fn(),findRow_:()=>2,ensureColumn_:()=>{},headers_:()=>orders.data[0]});
assert.equal(c.saveShipment_({orderId:'O',carrier:'Carrier',reference:'123',trackingUrl:'https://example.com/track?id=123',expectedUpdatedAt:''}).success,true);
assert.throws(()=>c.saveShipment_({orderId:'O',expectedUpdatedAt:''}),/changed/);
for(const url of ['javascript:alert(1)','https://name:secret@example.com','http://example.com','https://example.com/<bad>'])assert.throws(()=>c.safeShopLink_(url,false));
assert.equal(c.safeShopLink_('https://www.instagram.com/reel/abc_123/',true),'https://www.instagram.com/reel/abc_123/');
assert.throws(()=>c.safeShopLink_('https://instagram.com.evil.com/reel/abc',true));
const ui=vm.createContext({URL,window:{},document:{addEventListener(){}}});vm.runInContext(fs.readFileSync('admin-shop-tools.js','utf8'),ui);
const campaign=ui.window.DSBShopTools.campaignLink('/product.html?id=P%261&size=S',{source:'instagram',medium:'social',campaign:'त्योहार sale'}),url=new URL(campaign);
assert.equal(url.searchParams.get('id'),'P&1');assert.equal(url.searchParams.get('size'),'S');assert.equal(url.searchParams.get('utm_campaign'),'त्योहार sale');
assert.throws(()=>ui.window.DSBShopTools.campaignLink('https://evil.com',{source:'a',medium:'b',campaign:'c'}));assert.throws(()=>ui.window.DSBShopTools.campaignLink('/',{}));
// Soft budget checks count retries too and retain usage from completed calls.
c.DSB_AI_BUDGET_=null;for(let i=0;i<4;i++)c.aiBudgetBeforeCall_();assert.throws(()=>c.aiBudgetBeforeCall_(),/budget/);
c.DSB_AI_BUDGET_=null;c.aiBudget_().startedAt=Date.now()-76000;assert.equal(c.aiBudgetAvailable_(),false);
c.DSB_AI_BUDGET_=null;c.aiBudgetBeforeCall_();c.aiRecordUsage_({usage:{input_tokens:30,output_tokens:10}});assert.equal(c.aiUsage_().inputTokens,30);assert.equal(c.aiUsage_().partial,false);c.aiBudgetBeforeCall_();assert.equal(c.aiUsage_().partial,true);
c.DSB_AI_BUDGET_=null;let generated=0;Object.assign(c,{getAllProducts:()=>['A','B','C'].map(id=>({id})),isArchived_:()=>false,aiAdminAnalyzeOneProduct_:p=>{generated++;return {id:p.id,suggestedPatch:{description:'x'}};}});
const batch=c.aiAdminAnalyzeProducts_({ids:['A','B','C'],instruction:'Improve descriptions'}, {},owner);assert.equal(generated,2);assert.deepEqual(Array.from(batch.remainingIds),['C']);
console.log('PASS: size stock validation, order/recovery/cancellation/reactivation, shipment conflicts, permissions, UTM encoding, safe links, AI budgets and resumable batches.');
