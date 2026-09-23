import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
class Sheet {
 constructor(name,rows=[]){this.name=name;this.rows=rows;}
 getLastRow(){return this.rows.length;} getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
 appendRow(row){this.rows.push([...row]);} hideSheet(){} deleteRows(start,n){this.rows.splice(start-1,n);}
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
 createTextFinder(text){return this.getDataRange().createTextFinder(text);}
 getRange(r,c,n=1,m=1){const s=this;return {
 getRow:()=>r,getValue:()=>s.rows[r-1]?.[c-1]??'',
 getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>s.rows[r+i-1]?.[c+j-1]??'')),
 setValue(v){return this.setValues([[v]]);},setValues(values){values.forEach((row,i)=>row.forEach((v,j)=>{s.rows[r+i-1]??=[];s.rows[r+i-1][c+j-1]=v;}));return this;},
 clearContent(){return this.setValues(Array.from({length:n},()=>Array(m).fill('')));},
 createTextFinder(text){let regex=false;const finder={matchEntireCell(){return finder;},useRegularExpression(v){regex=v;return finder;},findAll(){const hits=[];for(let i=r;i<r+n;i++)for(let j=c;j<c+m;j++){const value=String(s.rows[i-1]?.[j-1]??'');if(regex?new RegExp(text).test(value):value===text)hits.push(s.getRange(i,j));}return hits;},findNext(){return finder.findAll()[0]||null;}};return finder;}
 };}
}
const sheets=new Map(),properties=new Map(),cache=new Map();let locked=false,onLock=null;
const props={getProperty:k=>properties.get(k)||null,setProperty(k,v){properties.set(k,v);},deleteProperty:k=>properties.delete(k)};
const c=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>props},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=new Sheet(n);sheets.set(n,s);return s;}}),flush(){}},CacheService:{getScriptCache:()=>({getAll:keys=>Object.fromEntries(keys.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)])),putAll:o=>Object.entries(o).forEach(([k,v])=>cache.set(k,v))})},LockService:{getScriptLock:()=>({tryLock(){assert(!locked);locked=true;if(onLock){const fn=onLock;onLock=null;fn();}return true;},releaseLock(){locked=false;}})},Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:d=>d.toISOString().slice(0,7).replace('-','_')}});
vm.runInContext(fs.readFileSync(new URL('../code.gs',import.meta.url),'utf8'),c);
Object.assign(c,{hashText_:s=>crypto.createHash('sha256').update(String(s)).digest('hex'),rateLimit_:()=>{},invalidateAnalyticsCaches_:()=>{}});
for(const phone of ['9876543210','+91 9876543210','09876543210'])assert.equal(c.canonicalPhone_(phone),'9876543210');
for(const oldPhone of ['9876543210','919876543210','09876543210']){
 const usage=new Sheet('PromoCustomers',[['code','phonehash','date'],['save|'+c.hashText_(oldPhone),'',new Date()]]);
 Object.assign(c,{getPromoByCode_:()=>({onepercustomer:'yes',type:'flat',value:10}),ensurePromoCustomersSheet_:()=>usage});
 assert.equal(c.validatePromoFast_('SAVE','+91 9876543210').ok,false);
}
assert.equal(c.knownCost_(''),false);assert.equal(c.knownCost_(' '),false);assert.equal(c.knownCost_(0),true);
assert.equal(c.orderItemCostKnown_({costPrice:0,costKnown:true}),true);
assert.equal(c.orderItemCostKnown_({costprice:0}),false);assert.equal(c.orderItemCostKnown_({costprice:25}),true);
c.recordOrderItemsFromValidated_('O1',new Date(),[{id:'P1',name:'A',qty:2,unitPrice:10,lineTotal:20,costPrice:0,costKnown:false},{id:'P2',name:'B',qty:1,unitPrice:10,lineTotal:10,costPrice:0,costKnown:true}]);
let recorded=c.rowsAsObjects_(sheets.get('OrderItems'));assert.equal(recorded[0].lineprofit,'');assert.equal(recorded[1].lineprofit,10);
c.recordOrderItemsFromValidated_('O1',new Date(),[{id:'P1',qty:2,costPrice:99,costKnown:true}]);assert.equal(sheets.get('OrderItems').getLastRow(),3);
let status='Pending';c.withWriteLock_=fn=>{locked=true;status='Shipped';try{return fn();}finally{locked=false;}};
c.findCustomerOrder_=()=>{assert(locked);return {status};};assert.equal(c.submitOrderRequest_({orderId:'O',phone:'9876543210',type:'cancel'}).error,'cancellation_unavailable');
const event=(qid,ts=new Date().toISOString())=>({qid,ts,name:'page_view'});
const batch=events=>c.recordAnalyticsBatch_({visitorId:'v',sessionId:'s',events});
assert.equal(batch([event('same'),event('same')]).accepted,1);
cache.clear();const active=sheets.get('AnalyticsEvents');assert(active);
for(let i=0;i<1601;i++)active.appendRow([new Date(),'v','s','page_view','','','','','','','','','','','','','other'+i]);
assert.equal(batch([event('same')]).accepted,0,'retry beyond old 1500-row tail');
assert.equal(batch([event('ancient','2000-01-01'),event('future','2100-01-01'),event('invalid','invalid')]).accepted,0);
onLock=()=>properties.set('ANALYTICS_RESET_AT',new Date(Date.now()+1000).toISOString());assert.equal(batch([event('racing')]).accepted,0);
properties.delete('ANALYTICS_RESET_AT');cache.clear();
assert.equal(c.analyticsRegexEscape_('a.b+[x]'),'a\\.b\\+\\[x\\]');
const header=active.rows[0];const old=new Date(Date.now()-210*86400000);active.rows=[header,...Array.from({length:3},(_,i)=>[old,'v','s','page_view','','','','','','','','','','','','','old'+i]),[new Date(),'v','s','page_view']];
// Copy verified but deletion fails: retry must reuse the archive records.
const del=active.deleteRows.bind(active);active.deleteRows=()=>{throw Error('simulated interruption');};assert.throws(()=>c.maintainShopAnalytics(),/interruption/);
active.deleteRows=del;assert.equal(c.maintainShopAnalytics().archived,3);assert.equal(active.getLastRow(),2);
const archives=[...sheets.values()].filter(s=>s.name.startsWith('AnalyticsArchive_'));assert.equal(archives.length,1);assert.equal(archives[0].getLastRow(),4);assert.equal(c.maintainShopAnalytics().archived,0);
assert.equal(header.filter(x=>String(x).toLowerCase()==='productid').length,1);
console.log('PASS: Phase 2/3 phone compatibility, costs, cancellation locking, durable dedup, timestamp/reset boundaries and interrupted archive recovery.');
