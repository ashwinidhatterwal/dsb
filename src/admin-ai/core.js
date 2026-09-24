const STORAGE_KEY = 'dsb_admin_ai_chat_v1';
const MAX_MESSAGES = 16;
const CONTEXT_MESSAGES = 6;
let messages = [];
let busy = false;
let currentProposal = null;
let pendingImageUrls = [];
let uploading = false;
let applying = false;
let sessionEpoch = 0;
let applyTimer = null;

const qs = (s, c = document) => c.querySelector(s);
const qsa = (s, c = document) => Array.from(c.querySelectorAll(s));


function collectAiSessionState() {
  const activeTab = document.querySelector('.admin-tab.active')?.id?.replace(/^tab-/, '') || '';
  const productId = typeof editingProductId !== 'undefined' && editingProductId ? String(editingProductId) : '';
  return {
    activeTab,
    editingProductId: productId,
    mode: productId ? 'edit' : (activeTab === 'add' ? 'create' : ''),
    proposalType: currentProposal?.type || ''
  };
}

function loadSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) messages = parsed.filter(x => x && ['user', 'assistant'].includes(x.role) && typeof x.text === 'string').map(x => ({ role: x.role, text: x.text, images: Array.isArray(x.images) ? x.images.filter(u => /^https:\/\//i.test(String(u || ''))).slice(0, 5) : [] })).slice(-MAX_MESSAGES);
  } catch (_) { messages = []; }
}
function saveSession() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (_) {}
}
function renderAiMessageText(text, role) {
  const safe = escapeHtml(String(text || '')).replace(/\n/g, '<br>');
  if (role !== 'assistant') return safe;
  return safe.replace(/\b(DSB-[A-Za-z0-9_-]{2,40})\b/g, (match, id) =>
    `<a href="#" class="admin-ai-product-link" data-ai-product-id="${escapeHtml(id)}" title="Edit ${escapeHtml(id)}">${escapeHtml(id)}</a>`
  );
}

async function openAiProductEditor(productId) {
  const id = String(productId || '').trim();
  if (!id || busy || applying) return;
  let product = Array.isArray(PRODUCTS) ? PRODUCTS.find(p => String(p.id || '').toLowerCase() === id.toLowerCase()) : null;
  try {
    if (!product) {
      if (!API_URL || !ADMIN_KEY || typeof adminRead !== 'function') throw new Error('Admin backend is not connected.');
      const data = await adminRead('adminProductsPage', { archived: false, query: id, sort: 'id-asc', page: 0 });
      product = Array.isArray(data?.products) ? data.products.find(p => String(p.id || '').toLowerCase() === id.toLowerCase()) : null;
    }
    if (!product) throw new Error(`Product ${id} was not found in the active catalog.`);
    if (typeof fillForm !== 'function') throw new Error('Product editor is unavailable.');
    fillForm(product);
    closeChat({ restoreFocus: false });
    showToast(`Editing ${id}`);
  } catch (err) {
    showToast(err?.message || `Could not open ${id}`);
  }
}

function addMessage(role, text, images = []) {
  const clean = String(text || '').trim();
  if (!clean) return;
  messages.push({ role, text: clean, images: images.slice(0, 5) });
  messages = messages.slice(-MAX_MESSAGES);
  saveSession();
  renderMessages();
}
function clearSession() {
  if (applying) return showToast('Wait for the current change to finish saving.');
  // In-flight AI replies/uploads belong to the old context and are discarded.
  sessionEpoch++;
  qs('#aiContinueBatch')?.remove(); pendingResumeBatch=null;
  busy = false;
  uploading = false;
  pendingImageUrls = [];
  messages = [];
  currentProposal = null;
  const input = qs('#adminAiInput');
  if (input) input.value = '';
  const file = qs('#adminAiImageInput');
  if (file) file.value = '';
  saveSession();
  renderPendingImages();
  renderMessages();
  renderProposal(null);
  autoSizeInput();
  ['#adminAiSend', '#adminAiAttach', '#adminAiClear', '#adminAiNew'].forEach(id => { const el = qs(id); if (el) el.disabled = false; });
  qs('#adminAiDrawer')?.classList.remove('thinking');
  qs('#adminAiStatus').textContent = 'Fresh chat — previous context cleared';
  input?.focus({ preventScroll: true });
}

function openChat() {
  if (window.DSBAIConfig && !window.DSBAIConfig.state.models.length) window.DSBAIConfig.loadModels().catch(() => {});
  const drawer = qs('#adminAiDrawer');
  if (!drawer) return;
  drawer.inert = false;
  const backdrop = qs('#adminAiBackdrop');
  if (backdrop) backdrop.hidden = true;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('admin-ai-open');
  renderMessages();
  setTimeout(() => qs('#adminAiInput')?.focus(), 30);
}
function closeChat({ restoreFocus = true } = {}) {
  const drawer = qs('#adminAiDrawer');
  if (!drawer) return;
  drawer.inert = true;
  const backdrop = qs('#adminAiBackdrop');
  if (backdrop) backdrop.hidden = true;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('admin-ai-open');
  if (restoreFocus) qs('#adminAiOpen')?.focus({ preventScroll: true });
}

function renderMessages() {
  const root = qs('#adminAiMessages');
  if (!root) return;
  const context = qs('#adminAiContext');
  if (context) context.textContent = messages.length ? `${Math.min(CONTEXT_MESSAGES, messages.length)} recent messages in context` : 'Fresh context';
  if (!messages.length) {
    root.innerHTML = `<div class="admin-ai-welcome">
      <div class="admin-ai-orb">✦</div>
      <strong>AI Copilot</strong>
      <p>Work with products, orders, stock and sales in one conversation. Find a product by name or ID; enrichment checks its main photo, gallery and your attachments, and every admin change is reviewed before apply.</p>
      <div class="admin-ai-prompts">
        <button type="button" data-prompt="Summarize the shop today.">Today's summary</button>
        <button type="button" data-prompt="Show me the products that need restocking.">Low stock</button>
        <button type="button" data-prompt="Audit catalog quality and listing gaps.">Catalog audit</button>
        <button type="button" data-prompt="Summarize pending orders and anything that needs attention.">Pending orders</button>
      </div>
    </div>`;
    root.querySelectorAll('[data-prompt]').forEach(btn => btn.addEventListener('click', () => {
      qs('#adminAiInput').value = btn.dataset.prompt;
      sendMessage();
    }));
    return;
  }
  root.innerHTML = messages.map(m => {
    const thumbs = Array.isArray(m.images) && m.images.length ? `<div class="admin-ai-msg-images">${m.images.map((url, i) => `<img src="${escapeHtml(url)}" alt="Attached photo ${i + 1}" loading="lazy" decoding="async">`).join('')}</div>` : '';
    return `<div class="admin-ai-msg ${m.role}"><div>${thumbs}${renderAiMessageText(m.text, m.role)}</div></div>`;
  }).join('');
  root.querySelectorAll('[data-ai-product-id]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    openAiProductEditor(link.dataset.aiProductId);
  }));
  const scroller = qs('#adminAiConversation') || root;
  scroller.scrollTop = scroller.scrollHeight;
}
