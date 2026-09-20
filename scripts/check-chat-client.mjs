import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},style:{},classList:{add(){},remove(){}},addEventListener(){},focus(){},scrollIntoView(){},setAttribute(){},querySelectorAll(){return []},scrollHeight:40});
  return elements.get(key);
}
const selected = [{dataset:{aiField:'description'}}];
element('#adminAiProposal').querySelectorAll = selector => selector.includes(':checked') ? selected : [];
const requests=[];
const context={console,setTimeout(){},crypto:{randomUUID:()=> 'request1'},sessionStorage:{setItem(){},getItem:()=>null},
 document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
 API_URL:'https://example.invalid',ADMIN_KEY:'fixture',ADMIN_PROFILE:{role:'owner'},reducedMotion:()=>true,showToast(){},escapeHtml:String,
 uploadFileToCloudinary:async()=> 'https://example.com/reference.jpg',
 adminFetch:async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);
 return {json:async()=>body.action==='aiAdminChat'?{reply:'Prepared Nail Clipper (DSB-0042)',proposal:{type:'update_product',targetId:'DSB-0042',title:'Enrich nail clipper',patch:{description:'Improved copy',descriptionhindi:'Hindi copy'},current:{description:'Old'},expectedRevision:'rev1'}}:{success:true}};
 }};
vm.createContext(context);
const source=fs.readFileSync('admin-chat.js','utf8').replace(/\}\)\(\);\s*$/, 'globalThis.testChat = {attachImages,sendMessage,applyProposal,clearSession}; })();');
vm.runInContext(source,context);
await context.testChat.attachImages([{type:'image/png'}]);
element('#adminAiInput').value='find nail clipper and enrich the details of product';
await context.testChat.sendMessage();
assert.equal(requests[0].imageUrls[0],'https://example.com/reference.jpg');
assert(element('#adminAiMessages').innerHTML.includes('admin-ai-msg-images'));
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
