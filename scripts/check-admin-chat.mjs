import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const order = JSON.parse(fs.readFileSync('src/build-order.json', 'utf8'));
const aiSources = order.backend.filter(file => file.includes('/ai-admin-'));
const backend = aiSources.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const providerBackend = fs.readFileSync('src/backend/ai-product.gs', 'utf8');
const auth = fs.readFileSync('src/backend/admin-auth.gs', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const client = fs.readFileSync('admin-chat.js', 'utf8');
const productAssist = fs.readFileSync('admin-ai.js', 'utf8');

assert(order.backend.includes('src/backend/ai-admin-chat.gs') && order.backend.includes('src/backend/ai-admin-tools.gs') && order.backend.includes('src/backend/ai-admin-context.gs') && order.backend.includes('src/backend/ai-admin-actions.gs'), 'Tool-driven Admin AI backend missing from build order');
assert(Array.isArray(order.adminChat) && order.adminChat.length >= 5, 'Admin AI client must be built from maintainable source fragments');
assert(auth.includes("action === 'aiAdminChat'") && auth.includes("'aiAdminChat'"), 'Admin AI chat action/permission missing');
assert(html.includes('id="adminAiOpen"') && html.includes('id="adminAiDrawer"') && html.includes('admin-chat.js'), 'Admin AI chat UI is not wired');
assert(client.includes('sessionStorage') && client.includes('dsb_admin_ai_chat_v1'), 'Session chat memory is missing');
assert(client.includes('CONTEXT_MESSAGES = 6') && client.includes('sessionState: collectAiSessionState()'), 'Compact chat context/session state is missing');
assert(client.includes("action: 'aiAdminChat'"), 'Admin AI client does not call chat backend');
assert(client.includes('Confirm apply') && client.includes('applyProposal'), 'Confirmation-first action apply flow is missing');
assert(client.includes('data-ai-product-id') && client.includes('openAiProductEditor'), 'AI product references must open the product editor');
assert(productAssist.includes('closeDialog({ force: true })'), 'Successful product detail generation must auto-close its dialog');
assert(client.includes("action: 'update'") && client.includes("action: 'add'") && client.includes("action: 'updateOrderStatus'") && client.includes("action: 'archiveProduct'"), 'Expected admin action adapters are missing');
assert(!backend.includes('deleteProduct(') && !backend.includes('verifyPayment_('), 'AI chat must not directly perform destructive/payment actions');
assert(backend.includes('executeAiAdminTool_') && backend.includes('query_products') && backend.includes('analyze_products'), 'Generic tool gateway is missing');
assert(backend.includes('generateAiProductDraft_'), 'Image-aware product analysis must reuse the product generator');
assert(backend.includes('aiAdminOptimizedImageUrl_'), 'AI image optimization is missing');
assert(!backend.includes('classifyAiAdminIntent_') && !backend.includes('aiAdminLocalReport_'), 'Legacy intent/report routing should be removed');

const context = { console, aiBudgetAvailable_:()=>true };
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'ai-admin-chat.gs' });
const history = Array.from(context.sanitizeAiAdminHistory_([{role:'user',text:' hello '},{role:'assistant',text:' ok '},{role:'system',text:'no'}]));
assert.equal(history.length, 3);
assert.equal(history[0].text, 'hello');
assert.equal(history[2].role, 'user');
const longHistory = Array.from({length:20}, (_,i)=>({role:i%2?'assistant':'user', text:'x'.repeat(1500)}));
assert.equal(context.sanitizeAiAdminHistory_(longHistory).length, 8);
assert.equal(context.sanitizeAiAdminHistory_(longHistory)[0].text.length, 1200);

const patch = context.sanitizeAiAdminProductPatch_({name:' Test ',price:'220',stockqty:3.9,stock:'IN STOCK',evil:'x'});
assert.equal(patch.name, 'Test');
assert.equal(patch.price, 220);
assert.equal(patch.stockqty, 3);
assert.equal(patch.stock, 'in stock');
assert.equal(patch.evil, undefined);

assert(html.includes('id="adminAiAttach"') && html.includes('id="adminAiImageInput"') && html.includes('id="adminAiImagePreview"'), 'Admin AI image attachment controls are missing');
assert(client.includes('pendingImageUrls') && client.includes('uploadFileToCloudinary') && client.includes('imageUrls'), 'Admin AI client does not upload/send chat images');
assert(backend.includes('sanitizeAiAdminImageUrls_') && backend.includes('callAiStructuredJson_') && providerBackend.includes("type: 'image_url'") && providerBackend.includes("type: 'input_image'"), 'Admin AI backend does not support shared vision chat images');

const products = [
  {id:'DSB-0008',name:'Red Bridal Bangle Set',tags:'bridal, red',description:'Old copy',image:'https://example.com/a.jpg',images:'https://example.com/a2.jpg',price:220,stockqty:5,stock:'in stock'},
  {id:'DSB-0009',name:'Red Bridal Bangles Set',tags:'bridal, red, glass',description:'Other copy',image:'https://example.com/b.jpg',price:230,stockqty:2,stock:'in stock'},
  {id:'DSB-0010',name:'Nail Clipper',tags:'nail, care',description:'Clipper',image:'https://example.com/c.jpg',price:99,stockqty:0,stock:'out of stock'}
];
context.getAllProducts = () => products;
context.isArchived_ = p => p.archived === true;
context.safeNumber_ = (v,fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
context.productRevision_ = () => 'rev1';
context.rowsAsObjects_ = () => [];
context.getSheet_ = () => ({});

let q = context.aiAdminQueryProducts_({tagCount:2,includeImages:true});
assert.equal(q.count, 2);
assert(q.products.every(p => p.tagCount === 2));
q = context.aiAdminQueryProducts_({similarNames:true});
assert(q.pairs.some(pair => pair.products.some(p => p.id === 'DSB-0008') && pair.products.some(p => p.id === 'DSB-0009')));

let draftRequest;
context.generateAiProductDraft_ = body => {
  draftRequest = body;
  return {draft:{tags:['bridal','red','wedding','bangle set'],description:'Improved descriptive copy',price:1,stockqty:99},warnings:[],model:'fixture'};
};
const analyzed = context.aiAdminAnalyzeProducts_({ids:['DSB-0008'],instruction:'Improve tags based on product photos'}, {modelConfigId:'x'}, {role:'admin'});
assert.equal(analyzed.analyzed,1);
assert.equal(analyzed.results[0].id,'DSB-0008');
assert.equal(analyzed.results[0].suggestedPatch.tags,'bridal, red, wedding, bangle set');
assert.equal(analyzed.results[0].suggestedPatch.price,undefined);
assert.equal(analyzed.results[0].suggestedPatch.stockqty,undefined);
assert.equal(draftRequest.imageUrl,products[0].image);

const permitted={permittedProductIds:{'DSB-0008':true},permittedOrderIds:{}};
const batch=context.sanitizeAiAdminChatResult_({reply:'Review',action:{type:'batch_update_products',items:[{targetId:'DSB-0008',patch:{tags:'bridal, red, wedding'}}]}},permitted,{role:'admin'});
assert.equal(batch.proposal.type,'batch_update_products');
assert.equal(batch.proposal.items.length,1);
const blocked=context.sanitizeAiAdminChatResult_({reply:'No',action:{type:'update_product',targetId:'DSB-0010',patch:{description:'x'}}},permitted,{role:'admin'});
assert.equal(blocked.proposal,null);

context.generateAiProductDraft_ = body => ({draft:{name:'Nail clipper',price:99,description:'A compact nail care tool.',descriptionhindi:'नाखून काटने का उपकरण।',category:'Personal care',tags:['nail care']},warnings:[],model:'fixture'});
const photos=['https://example.com/front.jpg','https://example.com/back.jpg'];
const created=context.maybeGenerateAiAdminNewProduct_({},'Add a new product with these photos',[],{role:'admin'},photos,false);
assert.equal(created.proposal.type,'add_product');
assert.equal(created.proposal.patch.image,photos[0]);
assert.equal(created.proposal.patch.images,photos[1]);

console.log('Admin AI tool-gateway, bounded vision analysis, proposal safety and creation checks passed.');
