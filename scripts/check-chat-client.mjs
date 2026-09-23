import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},style:{},classList:{add(){},remove(){},contains(){return false}},remove(){},addEventListener(){},focus(){},scrollIntoView(){},setAttribute(){},querySelectorAll(){return []},scrollHeight:40});
  return elements.get(key);
}
const selected = [{dataset:{aiField:'description'}}];
element('#adminAiProposal').querySelectorAll = selector => selector.includes(':checked') ? selected : [];
const requests=[];
const context={console,clearTimeout(){},setTimeout(){},crypto:{randomUUID:()=> 'request1'},sessionStorage:{setItem(){},getItem:()=>null},
 document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
 API_URL:'https://example.invalid',ADMIN_KEY:'fixture',ADMIN_PROFILE:{role:'owner'},reducedMotion:()=>true,showToast(){},escapeHtml:String,
 uploadFileToCloudinary:async()=> 'https://example.com/reference.jpg',
 adminFetch:async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);
 return {json:async()=>body.action==='aiAdminChat'?{reply:'Prepared Nail Clipper (DSB-0042)',proposal:{type:'update_product',targetId:'DSB-0042',title:'Enrich nail clipper',patch:{description:'Improved copy',descriptionhindi:'Hindi copy'},current:{description:'Old'},expectedRevision:'rev1'}}:{success:true}};
 }};
vm.createContext(context);
const source=fs.readFileSync('admin-chat.js','utf8').replace(/\}\)\(\);\s*$/, 'globalThis.testChat = {attachImages,sendMessage,applyProposal,clearSession,renderProposal,readProposalEdits}; })();');
vm.runInContext(source,context);
await context.testChat.attachImages([{type:'image/png'}]);
element('#adminAiInput').value='find nail clipper and enrich the details of product';
await context.testChat.sendMessage();
assert.equal(requests[0].imageUrls[0],'https://example.com/reference.jpg');
assert(element('#adminAiMessages').innerHTML.includes('admin-ai-msg-images'));
assert(element('#adminAiMessages').innerHTML.includes('data-ai-product-id=\"DSB-0042\"'), 'Assistant product IDs should render as editor links');
assert(element('#adminAiProposal').innerHTML.includes('data-ai-field="descriptionhindi"'));
await context.testChat.applyProposal();
assert.equal(requests[1].product.id,'DSB-0042');
assert.equal(requests[1].product.description,'Improved copy');
assert.equal(requests[1].product.descriptionhindi,undefined);
context.testChat.clearSession();
assert.equal(element('#adminAiProposal').hidden,true);
assert.equal(element('#adminAiImagePreview').hidden,true);
assert(element('#adminAiMessages').innerHTML.includes('Catalog audit'));
console.log('Chat client integration passed: attachment persistence, chat request, review fields, selective Apply and reset.');

// Reset during generation discards the old reply and proposal.
let finishOld;
context.adminFetch = async (url, options) => {
 requests.push(JSON.parse(options.body));
 return new Promise(resolve => { finishOld = resolve; });
};
element('#adminAiInput').value = 'enrich DSB-0008';
const oldRequest = context.testChat.sendMessage();
context.testChat.clearSession();
assert.equal(element('#adminAiInput').value, '');
assert.equal(element('#adminAiContext').textContent, 'Fresh context');
finishOld({json:async()=>({reply:'STALE SHAMPOO',proposal:{type:'update_product',patch:{name:'STALE'}}})});
await oldRequest;
assert(!element('#adminAiMessages').innerHTML.includes('STALE'));
assert.equal(element('#adminAiProposal').hidden, true);
context.adminFetch = async (url, options) => {
 requests.push(JSON.parse(options.body));
 return {json:async()=>({reply:'New conversation'})};
};
element('#adminAiInput').value = 'find nail clipper';
await context.testChat.sendMessage();
assert.equal(requests.at(-1).history.length, 0);
context.testChat.clearSession();
let finishUpload;
context.uploadFileToCloudinary = () => new Promise(resolve => { finishUpload = resolve; });
const upload = context.testChat.attachImages([{type:'image/png'}]);
context.testChat.clearSession();
finishUpload('https://example.com/stale.jpg');
await upload;
assert.equal(element('#adminAiImagePreview').hidden, true);
console.log('Fresh-context regressions passed: reset during AI request/upload, draft clearing and empty next-request history.');

// Review editors must send the user's corrections, not the original AI text.
let editorValues = [
 {dataset:{aiEdit:'name'},value:'Corrected name'},
 {dataset:{aiEdit:'price'},value:'149'},
 {dataset:{aiEdit:'description'},value:'Manually corrected description'},
 {dataset:{aiEdit:'costprice'},value:''},
 {dataset:{aiEdit:'image'},value:'https://example.com/front.jpg'}
];
editorValues.forEach(input => { input.addEventListener = () => {}; });
element('#adminAiProposal').querySelectorAll = selector => selector === '[data-ai-edit]' ? editorValues : selector.includes(':checked') ? selected : [];
context.testChat.renderProposal({type:'add_product',patch:{name:'AI name',price:99,description:'AI description',costprice:0}});
assert(element('#adminAiProposal').innerHTML.includes('data-ai-edit="descriptionhindi"'));
await context.testChat.applyProposal();
assert.equal(requests.at(-1).product.name,'Corrected name');
assert.equal(requests.at(-1).product.price,149);
assert.equal(requests.at(-1).product.description,'Manually corrected description');
assert.equal(requests.at(-1).product.costprice,undefined);
context.testChat.renderProposal({type:'add_product',patch:{name:'Unknown price'}});
editorValues.find(x=>x.dataset.aiEdit==='price').value='';
const beforeInvalid=requests.length;
await context.testChat.applyProposal();
assert.equal(requests.length,beforeInvalid,'Blank price must not save');
console.log('Editable review passed: manual name/description/price, blank unknown values, and required price validation.');
