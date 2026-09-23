import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('code.gs', root),'utf8');
const html = fs.readFileSync(new URL('admin.html',root),'utf8');
const analytics = fs.readFileSync(new URL('admin-analytics.js',root),'utf8');
const reviewsUi = fs.readFileSync(new URL('admin-reviews.js',root),'utf8');
class Sheet {
 constructor(headers, rows=[]){this.data=[headers,...rows];}
 getLastRow(){return this.data.length;}getLastColumn(){return this.data[0].length;}
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
 appendRow(row){this.data.push([...row]);}
 getRange(row,col,n=1,width=1){const sheet=this;return {
  getRow(){return row;}, getValue(){return sheet.data[row-1]?.[col-1]??'';},
  getValues(){return Array.from({length:n},(_,i)=>Array.from({length:width},(_,j)=>sheet.data[row+i-1]?.[col+j-1]??''));},
  setValue(v){sheet.data[row-1]??=[];sheet.data[row-1][col-1]=v;},
  createTextFinder(needle){return {matchEntireCell(){return this;},matchCase(){return this;},findNext(){for(let i=row;i<row+n;i++)if(String(sheet.data[i-1]?.[col-1])===String(needle))return sheet.getRange(i,col);return null;}};}
 };}
}
const product = new Sheet(['id'],[['P1']]);
const reviews = new Sheet(['id','productId','name','rating','comment','date','verified','verificationRef'],[['REV-OLD','P1','Previous review',2,'Old feedback',new Date('2026-09-01'),'','']]);
const sheets={Products:product,Reviews:reviews};
const props=new Map([['ADMIN_KEY','really-long-random-owner-key-123']]);
const c=vm.createContext({console,Date,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>sheets[name]})},
 PropertiesService:{getScriptProperties:()=>({getProperty:name=>props.get(name)||null})},
 Utilities:{getUuid:()=> 'abcdef12-0000-4000-8000-000000000000',DigestAlgorithm:{SHA_1:'sha1'},computeDigest:(algorithm,value)=>[...crypto.createHash(algorithm).update(value).digest()]}
});
vm.runInContext(source,c);
let lockCount=0,clearCount=0;
Object.assign(c,{withWriteLock_:fn=>{lockCount++;return fn();},cacheGetChunkedJson_:()=>null,cacheGetJson_:()=>null,cachePutJson_:()=>{},cacheRemove_:()=>{clearCount++;},rateLimit_:()=>{},hashText_:s=>'hash:'+s});
assert.equal(c.getReviews('P1').length,1,'older unmoderated rows remain published');
assert.equal(c.getReviewSummaries().P1.count,1);
const created=c.addReview({productId:'P1',name:'Fair review',comment:'Not bad',rating:1});
assert.equal(created.pending,true);assert.equal(c.getReviews('P1').length,1,'new unverified review must stay private');
assert.equal(c.getReviewSummaries().P1.count,1,'pending rating must not affect public average');
const owner={role:'admin',name:'Owner'}, viewer={role:'viewer',name:'Staff'};
assert.throws(()=>c.moderateReview_({reviewId:created.id,status:'Approved'},viewer),/owner/);
assert.equal(c.moderateReview_({reviewId:created.id,status:'Approved',expectedStatus:'Pending'},owner).status,'Approved');
assert.equal(c.getReviews('P1').length,2);
assert.throws(()=>c.moderateReview_({reviewId:created.id,status:'Hidden',expectedStatus:'Pending'},owner),/changed/);
assert.equal(c.moderateReview_({reviewId:created.id,status:'Hidden',expectedStatus:'Approved'},owner).status,'Hidden');
assert.equal(c.getReviews('P1').length,1);
assert(lockCount>=4 && clearCount>=6);
assert.equal(c.authenticateAdmin_(props.get('ADMIN_KEY')).role,'admin');
assert.equal(c.dispatchAdmin_({action:'adminSession'},owner).version,24);
assert.equal(c.dispatchAdmin_({action:'adminSession',options:{requiredVersion:25}},owner).version,25);
props.set('ADMIN_KEY','weak');assert.equal(c.authenticateAdmin_('weak').role,'admin');
props.set('ADMIN_KEY','really-long-random-owner-key-123');
assert.throws(()=>c.assertAdminPermission_(viewer,'moderateReview'),/does not allow/);
assert.throws(()=>c.assertAdminPermission_(viewer,'imageUploadAuthorization'),/does not allow/);
assert.equal(c.imageUploadAuthorization_(owner).mode,'unsigned');
props.set('CLOUDINARY_API_KEY','public-key');
assert.throws(()=>c.imageUploadAuthorization_(owner),/incomplete/);
props.set('CLOUDINARY_API_SECRET','secret-key');props.set('CLOUDINARY_SIGNED_UPLOAD_PRESET','dsb_signed');
const upload=c.imageUploadAuthorization_(owner);
assert.equal(upload.mode,'signed');assert.equal(upload.apiKey,'public-key');
assert.equal(upload.signature,crypto.createHash('sha1').update('timestamp='+upload.timestamp+'&upload_preset=dsb_signedsecret-key').digest('hex'));
assert.throws(()=>c.imageUploadAuthorization_(viewer),/editors/);
assert(html.includes('for="apiUrl"') && html.includes('for="adminKey"'));
assert(html.includes('analyticsChartData') && html.includes('analyticsExportCsv') && html.includes('tab-reviews'));
assert(analytics.includes('data-edit-product') && analytics.includes('exportDailyCsv'));
assert(reviewsUi.includes('escapeHtml(row.comment)') && reviewsUi.includes('expectedStatus'));
console.log('PASS: moderated review visibility, legacy compatibility, stale transitions, owner permissions, key setup and admin access controls.');
