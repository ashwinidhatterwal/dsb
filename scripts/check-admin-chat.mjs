import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const order = JSON.parse(fs.readFileSync('src/build-order.json', 'utf8'));
const aiSources = order.backend.filter(file => file.includes('/ai-admin-'));
const backend = aiSources.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const auth = fs.readFileSync('src/backend/admin-auth.gs', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const client = fs.readFileSync('admin-chat.js', 'utf8');

assert(order.backend.includes('src/backend/ai-admin-chat.gs') && order.backend.includes('src/backend/ai-admin-context.gs') && order.backend.includes('src/backend/ai-admin-actions.gs'), 'Modular Admin AI backend missing from build order');
assert(Array.isArray(order.adminChat) && order.adminChat.length >= 5, 'Admin AI client must be built from maintainable source fragments');
assert(auth.includes("action === 'aiAdminChat'"), 'Admin AI chat action is not dispatched');
assert(auth.includes("'aiAdminChat'"), 'Admin AI chat permission missing');
assert(html.includes('id="adminAiOpen"') && html.includes('id="adminAiDrawer"') && html.includes('admin-chat.js'), 'Admin AI chat UI is not wired');
assert(client.includes('sessionStorage') && client.includes('dsb_admin_ai_chat_v1'), 'Session chat memory is missing');
assert(client.includes('CONTEXT_MESSAGES = 6') && client.includes('sessionState: collectAiSessionState()'), 'Compact chat context/session state is missing');
assert(client.includes("action: 'aiAdminChat'"), 'Admin AI client does not call chat backend');
assert(client.includes('Confirm apply') && client.includes('applyProposal'), 'Confirmation-first action apply flow is missing');
assert(client.includes("action: 'update'") && client.includes("action: 'add'") && client.includes("action: 'updateOrderStatus'") && client.includes("action: 'archiveProduct'"), 'Expected admin action adapters are missing');
assert(!backend.includes('deleteProduct(') && !backend.includes('verifyPayment_('), 'AI chat must not directly perform destructive/payment actions');
assert(backend.includes('maybeGenerateAiAdminProductEnrichment_') && backend.includes('generateAiProductDraft_'), 'Admin AI product enrichment must reuse the vision product generator');
assert(backend.includes('aiAdminOptimizedImageUrl_'), 'Admin AI enrichment should optimize listing images before vision analysis');

const context = { console };
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'ai-admin-chat.gs' });
const history = Array.from(context.sanitizeAiAdminHistory_([{role:'user',text:' hello '},{role:'assistant',text:' ok '},{role:'system',text:'no'}]));
assert.equal(history.length, 3);
assert.equal(history[0].text, 'hello');
assert.equal(history[2].role, 'user');

assert.equal(context.classifyAiAdminIntent_('Improve SEO tags for DSB-0042', {}, {}), 'content');
assert.equal(context.classifyAiAdminIntent_('Show low stock products', {}, {}), 'inventory');
assert.equal(context.classifyAiAdminIntent_('Summarize revenue today', {}, {}), 'analytics');
assert.equal(context.classifyAiAdminIntent_('What is happening with order 123?', {}, {}), 'orders');
assert.equal(context.classifyAiAdminIntent_('Improve this description', {}, {editingProductId:'DSB-0042'}), 'product_edit');
const longHistory = Array.from({length: 20}, (_, i) => ({role:i % 2 ? 'assistant':'user', text:'x'.repeat(1500)}));
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
assert(backend.includes('sanitizeAiAdminImageUrls_') && backend.includes("type: 'image_url'") && backend.includes("type: 'input_image'"), 'Admin AI backend does not support vision chat images');
assert(backend.includes('(chatImageUrls || []).concat(listingRefs)'), 'Chat images should be merged with product gallery images for enrichment');

console.log('Admin AI chat checks passed.');

const products = [
  {id:'DSB-0008', name:'Clinic Plus Health Shampoo', description:'Old shampoo copy', image:'https://example.com/shampoo.jpg'},
  {id:'DSB-0042', name:'Nail Clipper', description:'Old clipper copy', image:'https://example.com/clipper.jpg', images:'https://example.com/back.jpg', price:99, costprice:''}
];
context.getAllProducts = () => products;
context.isArchived_ = p => p.archived === true;
context.safeNumber_ = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
context.productRevision_ = () => 'rev1';
const oldChat = [{role:'assistant',text:'Applied: Update Clinic Plus Health Shampoo (DSB-0008).'}];
const resolve = (text, history=oldChat) => context.resolveAiAdminTarget_(text, history, products);
assert.equal(resolve('find nail clipper and enrich the details of product').products[0].id, 'DSB-0042');
assert.equal(resolve('find nail cutters and enrich details').products[0].id, 'DSB-0042');
assert.equal(resolve('find lipstick and enrich details').products.length, 0);
assert.equal(resolve('enrich DSB-9999').products.length, 0);
assert.equal(resolve('enrich its details').products[0].id, 'DSB-0008');
products.push({id:'DSB-0043',name:'Small Nail Clipper'});
assert.equal(resolve('find nail clipper and enrich details').products.length, 2);
products.pop();
let draftRequest;
context.generateAiProductDraft_ = body => {
  draftRequest = body;
  return {draft:{description:'Useful clipper copy',descriptionhindi:'नेल क्लिपर',tags:['nail care'],costprice:0,price:1,stockqty:0},model:'fixture',warnings:[]};
};
const actor = {role:'owner'};
const enrich = text => context.maybeGenerateAiAdminProductEnrichment_({},text,oldChat,{},actor,['https://example.com/reference.jpg']);
let proposal = enrich('find nail clipper and enrich the details of product').proposal;
assert.equal(proposal.targetId, 'DSB-0042');
assert.equal(proposal.patch.description, 'Useful clipper copy');
for (const key of ['costprice','price','stockqty']) assert.equal(proposal.patch[key], undefined);
assert.equal(draftRequest.imageUrl, products[1].image);
assert(draftRequest.referenceUrls.includes('https://example.com/reference.jpg'));
assert(draftRequest.referenceUrls.includes('https://example.com/back.jpg'));
assert.equal(enrich('fill all missing details for DSB-0042').proposal.patch.description, undefined);
proposal = enrich('Translate description for DSB-0042 into Hindi').proposal;
assert.equal(proposal.patch.description, undefined);
assert.equal(proposal.patch.descriptionhindi, 'नेल क्लिपर');
assert.equal(enrich('find lipstick and enrich details').proposal, null);
assert.equal(enrich('generate details for new product'), null);
assert.equal(context.maybeGenerateAiAdminProductEnrichment_({},'enrich details for DSB-0042',[],{}, {role:'viewer'},[]), null);
const blocked = context.sanitizeAiAdminChatResult_({reply:'edit',action:{type:'update_product',targetId:'DSB-0008',patch:{description:'Wrong'}}},{target:{ids:['DSB-0042']}},actor);
assert.equal(blocked.proposal,null);
products.push({id:'DSB-0050',name:'Nail Clipper',price:100,mrp:80,costprice:110,stockqty:0,stock:'in stock'});
const audit = context.aiAdminLocalReport_('Audit catalog quality');
for (const issue of ['MRP below selling price','cost above selling price','stock status disagrees','possible duplicate']) assert(audit.includes(issue));
assert(context.aiAdminLocalReport_('Show restock report').includes('DSB-0050'));
console.log('Target, enrichment, image, role, audit and restock regressions passed.');

// Creation must use the full generator and assign the original upload URLs.
context.generateAiProductDraft_ = body => {
 draftRequest = body;
 return {draft:{name:'Nail clipper',price:99,description:'A compact nail care tool.',descriptionhindi:'नाखून काटने का उपकरण।',category:'Personal care',tags:['nail care']},warnings:[],model:'fixture'};
};
const photos = ['https://example.com/front.jpg','https://example.com/back.jpg'];
const newDraft = context.maybeGenerateAiAdminNewProduct_({},'Add a new product with these photos',[],actor,photos,false);
assert.equal(newDraft.proposal.type,'add_product');
assert.equal(newDraft.proposal.patch.image,photos[0]);
assert.equal(newDraft.proposal.patch.images,photos[1]);
assert(newDraft.proposal.patch.description);
assert(newDraft.proposal.patch.descriptionhindi);
assert.equal(draftRequest.referenceUrls.length,1);
assert.equal(newDraft.proposal.patch.tags,'nail care');
const remembered=context.sanitizeAiAdminHistory_([{role:'user',text:'Nail clipper, price 99',images:photos}]);
assert.equal(context.aiAdminRequestImages_({},'Add a product from this photo',remembered)[0],photos[0]);
assert.equal(context.aiAdminRequestImages_({},'Find shampoo',remembered).length,0);
assert.equal(context.aiAdminRequestImages_({},'Use this photo',[]).length,0);
const oldApplied=[...remembered,{role:'assistant',text:'Applied: new product'}];
assert.equal(context.aiAdminRequestImages_({},'Use this photo',oldApplied).length,0);
context.maybeGenerateAiAdminNewProduct_({},'Add a new product',remembered,actor,['https://example.com/new.jpg'],false);
assert(!draftRequest.notes.includes('price 99'), 'Old photo facts must not leak into a different upload');
context.maybeGenerateAiAdminNewProduct_({},'Add a new product without photo',remembered,actor,photos,false);
assert.equal(context.maybeGenerateAiAdminNewProduct_({},'Add a new product without photo',remembered,actor,photos,false).proposal.patch.image,undefined);
context.generateAiProductDraft_ = () => ({draft:{name:'Draft without price',description:'Photo-supported description'},warnings:[]});
assert.equal(context.maybeGenerateAiAdminNewProduct_({},'Add a new product',[],actor,photos,false).proposal.patch.price,undefined);
assert.equal(context.maybeGenerateAiAdminNewProduct_({},'Add a new product',[],{role:'viewer'},photos,false),null);
console.log('Photo creation regressions passed: full drafts, original image URLs, photo follow-ups, unknown price and context isolation.');
