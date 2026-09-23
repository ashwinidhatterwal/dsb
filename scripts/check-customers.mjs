import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const c=vm.createContext({console,Date});vm.runInContext(read('code.gs'),c);
const now=Math.floor(Date.now()/1000), claims={sub:'alice',aud:'shop',iss:'https://securetoken.google.com/shop',exp:now+1000,auth_time:now-10,firebase:{sign_in_provider:'google.com'}};
let user={localId:'alice',email:'alice@example.test'},status=200,fetches=0;
c.secret_=k=>({CUSTOMER_ACCOUNTS_ENABLED:'true',CUSTOMER_FIREBASE_PROJECT_ID:'shop',CUSTOMER_FIREBASE_API_KEY:'key'}[k]||'');
c.Utilities={base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),newBlob:b=>({getDataAsString:()=>b.toString()}),getUuid:()=> '12345678-1234-4234-8234-123456789012'};
c.UrlFetchApp={fetch:()=>{fetches++;return {getResponseCode:()=>status,getContentText:()=>JSON.stringify({users:[user]})};}};
const token=changes=>'x.'+Buffer.from(JSON.stringify({...claims,...changes})).toString('base64url')+'.x';
assert.equal(c.customerIdentity_(token()).uid,'alice');
for(const changes of [{aud:'other'},{iss:'other'},{sub:'bob'},{exp:now-1},{auth_time:0},{firebase:{sign_in_provider:'password'}}])assert.throws(()=>c.customerIdentity_(token(changes)));
user.disabled=true;assert.throws(()=>c.customerIdentity_(token()));delete user.disabled;
user.validSince=now;assert.throws(()=>c.customerIdentity_(token()));delete user.validSince;
status=400;assert.throws(()=>c.customerIdentity_(token()),/HTTP_400/);
let upstreamMessage='API_KEY_HTTP_REFERRER_BLOCKED';
c.UrlFetchApp.fetch=()=>({getResponseCode:()=>403,getContentText:()=>JSON.stringify({error:{message:upstreamMessage}})});
assert.throws(()=>c.customerIdentity_(token()),/API_KEY_HTTP_REFERRER_BLOCKED/);
upstreamMessage='INVALID_ID_TOKEN';assert.throws(()=>c.customerIdentity_(token()),/INVALID_ID_TOKEN/);
upstreamMessage='some email@example.test and key=private';assert.throws(()=>c.customerIdentity_(token()),/HTTP_403/);
status=200;
c.UrlFetchApp.fetch=()=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify({users:[user]})});
assert.throws(()=>c.customerIdentity_('alice'));assert(fetches>0);
// Minimal Sheets fixture, including text coercion and exact case-sensitive ID search.
class Sheet{
 constructor(rows){this.rows=rows.map(r=>[...r]);}
 getLastRow(){return this.rows.length;} getLastColumn(){return this.rows[0].length;}
 getDataRange(){return {getValues:()=>this.rows.map(r=>[...r])};}
 appendRow(row){this.rows.push([...row]);} deleteRow(row){this.rows.splice(row-1,1);}
 getRange(row,col,n=1,w=1){const self=this;return {
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>self.rows[row+i-1]?.[col+j-1]??'')),
  setValues:values=>values.forEach((v,i)=>v.forEach((x,j)=>{self.rows[row+i-1]??=[];self.rows[row+i-1][col+j-1]=typeof x==='string'&&x.startsWith("'")?x.slice(1):x;})),
  setValue(value){this.setValues([[value]]);},
  createTextFinder(value){let matchCase=false;const hits=()=>Array.from({length:n},(_,i)=>row+i).filter(r=>matchCase?String(self.rows[r-1]?.[col-1])===String(value):String(self.rows[r-1]?.[col-1]).toLowerCase()===String(value).toLowerCase()).map(r=>({getRow:()=>r}));return{matchEntireCell(){return this;},matchCase(v){matchCase=v;return this;},findAll:hits,findNext:()=>hits()[0]};}
 };}
}
const sheets={Orders:new Sheet([['orderid','customeruid','customeritems','total','discount','deliverycharge','codcharge','costprice'],['A','alice',JSON.stringify([{name:'Bangles',qty:2,unitPrice:100,lineTotal:200,costPrice:2}]),230,0,30,0,2],['B','bob','[]',999,0,0,0,1]])};
c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>sheets[name],insertSheet:name=>sheets[name]=new Sheet([])})};
c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};c.rateLimit_=()=>{};
const req=(action,data={})=>c.customerDispatch_({action,idToken:token(),...data});
assert.equal(req('customer.profile.get').profile.email,'alice@example.test');
let result=req('customer.profile.save',{uid:'bob',profile:{name:'Alice',phone:'09876543210'}});assert.equal(result.success,true);assert.equal(result.profile.phone,'09876543210');assert.equal(sheets.Customers.rows[1][0],'alice');
const address={id:'12345678-1234-4234-8234-123456789012',name:'Alice',phone:'09876543210',address:'House 123, Test Road',pinCode:'335802',label:'Home',isDefault:true};
assert.equal(req('customer.address.save',{address}).success,true);
assert.equal(req('customer.address.save',{address}).addresses.length,1,'retry must not duplicate address');
user.localId='bob';const bobClaims={...claims,sub:'bob'};const bobToken='x.'+Buffer.from(JSON.stringify(bobClaims)).toString('base64url')+'.x';
assert.equal(c.customerDispatch_({action:'customer.address.save',idToken:bobToken,address}).success,false,'another user cannot overwrite address by ID');
assert.equal(c.customerDispatch_({action:'customer.address.delete',idToken:bobToken,addressId:address.id}).success,false);
user.localId='alice';
result=req('customer.orders.list',{uid:'bob'});assert.equal(result.orders.length,1);assert.equal(result.orders[0].orderId,'A');assert.equal(result.orders[0].subtotal,200);assert(!JSON.stringify(result).includes('costPrice'));assert(!JSON.stringify(result).includes('costprice'));
for(let i=0;i<15;i++)sheets.Orders.appendRow(['A'+i,'alice','[]',1,0,0,0,0]);
result=req('customer.orders.list');assert.equal(result.orders.length,10);assert(result.nextCursor);assert.equal(req('customer.orders.list',{cursor:result.nextCursor}).orders.length,6);
assert.equal(req('customer.saved.delete',{confirm:'no'}).success,false);
assert.equal(req('customer.saved.delete',{confirm:'DELETE_SAVED_DETAILS'}).success,true);assert.equal(req('customer.profile.get').addresses.length,0);assert.equal(sheets.Orders.rows.length,18);
// HTTP gateway passes verified identity separately; client UID and idToken cannot reach stored order payload.
let seen;c.jsonResponse=x=>x;c.addOrder=(order,uid)=>{seen={order,uid};return{success:true};};
c.doPostCore_({postData:{contents:JSON.stringify({action:'addOrder',idToken:token(),order:{customerUID:'bob',uid:'bob'}})}});assert.equal(seen.uid,'alice');
c.doPostCore_({postData:{contents:JSON.stringify({action:'addOrder',order:{uid:'bob'}})}});assert.equal(seen.uid,'');
status=400;assert.equal(c.doPostCore_({postData:{contents:JSON.stringify({action:'addOrder',idToken:token(),order:{}})}}).code,'customer_auth');
for(const name of ['index.html','product.html','catalog.html'])assert(read(name).includes('customer-account.js'));
assert(read('cart-ui-checkout.js').includes('pendingCheckout.guest=true'));
assert(read('src/backend/checkout.gs').includes('customeruid: customerUid'));
console.log('PASS: customer token/project/revocation checks, UID isolation, ownership, address retries, pagination, private order projection, saved-data deletion, and guest gateway (mocked Firebase/Sheets).');
