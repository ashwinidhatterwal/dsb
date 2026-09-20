/* Generated from src/admin-ai/*.js. Edit source fragments, not this file. */
(() => {
  'use strict';
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

  const fieldLabels = { namehindi: 'Hindi name', descriptionhindi: 'Hindi description', costprice: 'Cost price', stockqty: 'Stock quantity', packsize: 'Pack size', sizeprices: 'Size prices', gtin: 'GTIN', mrp: 'MRP' };
  const fieldLabel = key => fieldLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);

  function proposalLabel(proposal) {
    if (!proposal) return '';
    if (proposal.type === 'update_product') return 'Product edit';
    if (proposal.type === 'batch_update_products') return 'Catalog batch';
    if (proposal.type === 'add_product') return 'New product';
    if (proposal.type === 'update_order_status') return 'Order status';
    if (proposal.type === 'archive_product') return proposal.archived ? 'Archive product' : 'Restore product';
    return 'Admin action';
  }
  function displayValue(value) {
    if (value === '' || value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  const productFields = ['name','namehindi','price','mrp','costprice','category','subcategory','description','descriptionhindi','brand','material','packsize','specifications','tags','sizes','sizeprices','stock','stockqty','gtin','image','images'];
  const numericFields = ['price','mrp','costprice','stockqty'];
  function fieldEditor(key, value) {
    const text = value === undefined || value === null ? '' : String(value);
    const long = ['description','descriptionhindi','specifications','images'].includes(key);
    const attrs = `data-ai-edit="${escapeHtml(key)}" aria-label="${escapeHtml(fieldLabel(key))}"`;
    return long ? `<textarea ${attrs} rows="3" maxlength="${key === 'images' ? 5000 : 2000}">${escapeHtml(text)}</textarea>` : `<input ${attrs} type="${numericFields.includes(key) ? 'number' : 'text'}" ${numericFields.includes(key) ? `min="0" step="${key === 'stockqty' ? '1' : 'any'}"` : 'maxlength="1000"'} value="${escapeHtml(text)}">`;
  }
  function readProposalEdits(proposal) {
    if (!proposal || !['add_product','update_product'].includes(proposal.type)) return proposal;
    const patch = { ...proposal.patch };
    qsa('[data-ai-edit]', qs('#adminAiProposal')).forEach(input => {
      const key = input.dataset.aiEdit;
      const value = input.value.trim();
      if (numericFields.includes(key)) {
        if (!value) delete patch[key];
        else patch[key] = Number(value);
      } else if (value || proposal.type === 'update_product') patch[key] = value;
      else delete patch[key];
    });
    return { ...proposal, patch };
  }
  function renderProposal(proposal) {
    clearTimeout(applyTimer);
    applyTimer = null;
    const wrap = qs('#adminAiProposal');
    if (!wrap) return;
    if (proposal && proposal.type === 'add_product' && !proposal.requestId) proposal.requestId = crypto.randomUUID();
    currentProposal = proposal || null;
    if (!proposal) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    let detail = '';
    if (proposal.type === 'update_product') {
      const rows = Object.entries(proposal.patch || {}).map(([key, next]) => {
        const before = proposal.current ? proposal.current[key] : '';
        return `<div class="admin-ai-change"><label><input type="checkbox" data-ai-field="${escapeHtml(key)}" checked> ${escapeHtml(fieldLabel(key))}</label><del><small>Current</small>${escapeHtml(displayValue(before))}</del><strong><small>Edit suggestion</small>${fieldEditor(key, next)}</strong></div>`;
      }).join('');
      detail = `<div class="admin-ai-changes">${rows}</div>`;
    } else if (proposal.type === 'batch_update_products') {
      const items = Array.isArray(proposal.items) ? proposal.items : [];
      const cards = items.map((item, index) => {
        const fields = Object.entries(item.patch || {}).map(([key, next]) => {
          const before = item.current ? item.current[key] : '';
          return `<div class="admin-ai-batch-field"><label><input type="checkbox" data-ai-batch-field="${index}:${escapeHtml(key)}" checked> ${escapeHtml(fieldLabel(key))}</label><span><small>Current</small>${escapeHtml(displayValue(before))}</span><strong><small>Suggested</small>${escapeHtml(displayValue(next))}</strong></div>`;
        }).join('');
        return `<details class="admin-ai-batch-card" ${index === 0 ? 'open' : ''}><summary><label><input type="checkbox" data-ai-batch-item="${index}" checked> <b>${escapeHtml(item.targetId || '')}</b> ${escapeHtml(item.title || '')}</label><span>${Object.keys(item.patch || {}).length} fields</span></summary><div>${fields}</div></details>`;
      }).join('');
      const warningText = Array.isArray(proposal.warnings) && proposal.warnings.length ? `<div class="admin-ai-batch-warnings"><b>Notes</b>${proposal.warnings.map(x => `<div>${escapeHtml(x)}</div>`).join('')}</div>` : '';
      detail = `<div class="admin-ai-batch-summary">${items.length} ready for review${proposal.remainingCount ? ` · ${proposal.remainingCount} remaining for later batches` : ''}</div><div class="admin-ai-batch-list">${cards}</div>${warningText}`;
    } else if (proposal.type === 'add_product') {
      const photo = String(proposal.patch?.image || '');
      detail = `${/^https:\/\//i.test(photo) ? `<img class="admin-ai-draft-photo" src="${escapeHtml(photo)}" alt="Proposed listing photo">` : ''}<div class="admin-ai-editor-grid">${productFields.map(key => `<label class="admin-ai-editor-field">${escapeHtml(fieldLabel(key))}${fieldEditor(key, proposal.patch?.[key])}</label>`).join('')}</div>`;
    } else if (proposal.type === 'update_order_status') {
      detail = `<div class="admin-ai-status-change"><span>${escapeHtml(proposal.currentStatus || 'Pending')}</span><b>→</b><strong>${escapeHtml(proposal.status)}</strong></div>`;
    } else if (proposal.type === 'archive_product') {
      detail = `<div class="admin-ai-status-change"><span>${proposal.archived ? 'Active' : 'Archived'}</span><b>→</b><strong>${proposal.archived ? 'Archived' : 'Active'}</strong></div>`;
    }
    wrap.hidden = false;
    wrap.innerHTML = `<div class="admin-ai-proposal-head"><span>${escapeHtml(proposalLabel(proposal))}</span><button type="button" id="adminAiDismissProposal" aria-label="Dismiss proposed action">×</button></div>
      <strong class="admin-ai-proposal-title">${escapeHtml(proposal.title || 'Review proposed action')}</strong>
      <p>${escapeHtml(proposal.description || '')}</p>
      ${detail}
      <div class="admin-ai-proposal-actions"><button type="button" class="ghost-btn" id="adminAiDismissProposal2">Dismiss</button><button type="button" class="primary-btn" id="adminAiApplyProposal">Apply</button></div>
      <small>Nothing changes until you confirm Apply.</small>`;
    qs('#adminAiDismissProposal')?.addEventListener('click', () => renderProposal(null));
    qs('#adminAiDismissProposal2')?.addEventListener('click', () => renderProposal(null));
    qs('#adminAiApplyProposal')?.addEventListener('click', armProposalApply);
    qsa('[data-ai-edit]', wrap).forEach(input => input.addEventListener('input', () => {
      clearTimeout(applyTimer);
      const btn = qs('#adminAiApplyProposal');
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }));
    qsa('[data-ai-field]', wrap).forEach(box => box.addEventListener('change', () => {
      const btn = qs('#adminAiApplyProposal');
      btn.disabled = !qsa('[data-ai-field]:checked', wrap).length;
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }));
    qsa('[data-ai-batch-item]', wrap).forEach(box => box.addEventListener('change', () => {
      const index = box.dataset.aiBatchItem;
      qsa(`[data-ai-batch-field^="${index}:"]`, wrap).forEach(field => { field.checked = box.checked; field.disabled = !box.checked; });
      const btn = qs('#adminAiApplyProposal');
      btn.disabled = !qsa('[data-ai-batch-field]:checked', wrap).length;
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }));
    qsa('[data-ai-batch-field]', wrap).forEach(box => box.addEventListener('change', () => {
      const index = box.dataset.aiBatchField.split(':')[0];
      const item = qs(`[data-ai-batch-item="${index}"]`, wrap);
      const siblings = qsa(`[data-ai-batch-field^="${index}:"]`, wrap);
      if (item) item.checked = siblings.some(field => field.checked);
      const btn = qs('#adminAiApplyProposal');
      btn.disabled = !qsa('[data-ai-batch-field]:checked', wrap).length;
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }));
    const scroller = qs('#adminAiConversation');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function armProposalApply() {
    const btn = qs('#adminAiApplyProposal');
    if (!btn || btn.dataset.armed === '1') return applyProposal();
    btn.dataset.armed = '1';
    btn.textContent = 'Confirm apply';
    btn.classList.add('armed');
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      if (!btn.isConnected) return;
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }, 6000);
  }

  async function applyProposal() {
    let proposal = readProposalEdits(currentProposal);
    if (proposal?.type === 'update_product') {
      const selected = qsa('[data-ai-field]:checked', qs('#adminAiProposal')).map(box => box.dataset.aiField);
      if (!selected.length) return;
      proposal = { ...proposal, patch: Object.fromEntries(Object.entries(proposal.patch || {}).filter(([key]) => selected.includes(key))) };
    }
    if (proposal?.type === 'batch_update_products') {
      const selected = new Map();
      qsa('[data-ai-batch-field]:checked', qs('#adminAiProposal')).forEach(box => {
        const [indexText, ...keyParts] = box.dataset.aiBatchField.split(':');
        const index = Number(indexText), key = keyParts.join(':');
        if (!selected.has(index)) selected.set(index, []);
        selected.get(index).push(key);
      });
      if (!selected.size) return;
      proposal = { ...proposal, items: (proposal.items || []).map((item, index) => selected.has(index) ? { ...item, patch: Object.fromEntries(Object.entries(item.patch || {}).filter(([key]) => selected.get(index).includes(key))) } : null).filter(Boolean) };
    }
    const btn = qs('#adminAiApplyProposal');
    if (!proposal || !btn || busy) return;
    if (['add_product','update_product'].includes(proposal.type)) {
      for (const key of numericFields) {
        if (proposal.patch[key] !== undefined && (!Number.isFinite(proposal.patch[key]) || proposal.patch[key] < 0 || (key === 'stockqty' && !Number.isInteger(proposal.patch[key])))) return showToast('Enter a valid ' + fieldLabel(key));
      }
      if (proposal.type === 'add_product' && (!String(proposal.patch.name || '').trim() || !(proposal.patch.price > 0))) return showToast('Enter a product name and selling price greater than zero.');
      for (const key of ['image','images']) {
        if (proposal.patch[key] && (key === 'image' ? [String(proposal.patch[key])] : String(proposal.patch[key]).split(',')).some(url => !/^https:\/\//i.test(url.trim()))) return showToast('Product photos must use HTTPS URLs.');
      }
    }
    busy = true;
    applying = true;
    ['#adminAiNew', '#adminAiClear', '#adminAiSend', '#adminAiAttach'].forEach(id => { if (qs(id)) qs(id).disabled = true; });
    btn.disabled = true;
    btn.textContent = 'Applying…';
    qsa('[data-ai-edit], [data-ai-field]', qs('#adminAiProposal')).forEach(el => { el.disabled = true; });
    try {
      if (proposal.type === 'batch_update_products') {
        const items = Array.isArray(proposal.items) ? proposal.items : [];
        let applied = 0;
        const appliedIds = [];
        const failed = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          btn.textContent = `Applying ${i + 1}/${items.length}…`;
          try {
            const res = await adminFetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ key: ADMIN_KEY, action: 'update', clientVersion: 7, product: { id: item.targetId, ...(item.patch || {}), expected_revision: item.expectedRevision } }),
              timeoutMs: 60000
            });
            const data = await res.json();
            if (data?.error) throw new Error(data.error);
            applied++;
            if (item.targetId) appliedIds.push(item.targetId);
          } catch (err) {
            failed.push(`${item.targetId}: ${err?.message || err}`);
          }
        }
        if (applied) showToast(`Applied ${applied} catalog update${applied === 1 ? '' : 's'}`);
        addMessage('assistant', `Batch complete: ${applied} product${applied === 1 ? '' : 's'} updated.${appliedIds.length ? ` Reviewed IDs: ${appliedIds.join(', ')}.` : ''}${failed.length ? ` ${failed.length} failed: ${failed.slice(0,3).join(' | ')}` : ''}${proposal.remainingCount ? ` ${proposal.remainingCount} products remain; ask “continue catalog batch”.` : ''}`);
        renderProposal(null);
        if (typeof loadProducts === 'function') loadProducts(false);
        if (typeof loadDashboard === 'function') loadDashboard();
        return;
      }
      let payload;
      if (proposal.type === 'update_product') {
        const product = { id: proposal.targetId, ...(proposal.patch || {}), expected_revision: proposal.expectedRevision };
        if (Object.prototype.hasOwnProperty.call(proposal.patch || {}, 'stock')) product.expected_stock = proposal.expectedStock ?? '';
        if (Object.prototype.hasOwnProperty.call(proposal.patch || {}, 'stockqty')) product.expected_stockqty = proposal.expectedStockqty ?? '';
        payload = { key: ADMIN_KEY, action: 'update', clientVersion: 7, product };
      } else if (proposal.type === 'add_product') {
        payload = { key: ADMIN_KEY, action: 'add', requestId: proposal.requestId || crypto.randomUUID(), product: proposal.patch || {} };
      } else if (proposal.type === 'update_order_status') {
        payload = { key: ADMIN_KEY, action: 'updateOrderStatus', orderId: proposal.targetId, status: proposal.status };
      } else if (proposal.type === 'archive_product') {
        payload = { key: ADMIN_KEY, action: 'archiveProduct', id: proposal.targetId, archived: proposal.archived === true, expected_revision: proposal.expectedRevision };
      } else throw new Error('This proposed action is not supported.');

      const res = await adminFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        timeoutMs: 60000
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      showToast('AI action applied');
      addMessage('assistant', `Applied: ${proposal.title || proposalLabel(proposal)}.`);
      renderProposal(null);
      if (proposal.type === 'update_order_status') {
        if (typeof loadOrders === 'function') loadOrders();
      } else {
        if (typeof loadProducts === 'function') loadProducts(false);
      }
      if (typeof loadDashboard === 'function') loadDashboard();
    } catch (err) {
      showToast('Could not apply AI action');
      addMessage('assistant', `I couldn't apply that change: ${err?.message || err}`);
      const proposalCopy = proposal;
      renderProposal(proposalCopy);
    } finally {
      applying = false;
      busy = false;
      ['#adminAiNew', '#adminAiClear', '#adminAiSend', '#adminAiAttach'].forEach(id => { if (qs(id)) qs(id).disabled = false; });
      qsa('[data-ai-edit], [data-ai-field]', qs('#adminAiProposal')).forEach(el => { el.disabled = false; });
      const liveBtn = qs('#adminAiApplyProposal');
      if (liveBtn) {
        liveBtn.disabled = false;
        liveBtn.dataset.armed = '';
        liveBtn.textContent = 'Apply';
      }
    }
  }

  function renderPendingImages() {
    const wrap = qs('#adminAiImagePreview');
    if (!wrap) return;
    wrap.hidden = !pendingImageUrls.length;
    wrap.innerHTML = pendingImageUrls.map((url, i) => `<div class="admin-ai-pending-image"><img src="${escapeHtml(url)}" alt="AI reference photo ${i + 1}"><button type="button" data-remove-ai-image="${i}" aria-label="Remove attached photo">×</button></div>`).join('');
    qsa('[data-remove-ai-image]', wrap).forEach(btn => btn.addEventListener('click', () => {
      pendingImageUrls.splice(Number(btn.dataset.removeAiImage), 1);
      renderPendingImages();
    }));
    const attach = qs('#adminAiAttach');
    if (attach) attach.title = pendingImageUrls.length ? `${pendingImageUrls.length}/5 photos attached` : 'Attach product reference photo';
  }

  async function attachImages(files) {
    if (busy || uploading) return;
    const list = Array.from(files || []).filter(file => file && /^image\//i.test(file.type));
    if (!list.length) return;
    const room = Math.max(0, 5 - pendingImageUrls.length);
    if (!room) return showToast('Up to 5 AI reference photos per message');
    if (typeof uploadFileToCloudinary !== 'function') return showToast('Image upload helper is unavailable');
    const attach = qs('#adminAiAttach');
    const status = qs('#adminAiStatus');
    const epoch = sessionEpoch;
    uploading = true;
    if (attach) attach.disabled = true;
    qs('#adminAiSend').disabled = true;
    try {
      const selected = list.slice(0, room);
      for (let i = 0; i < selected.length; i++) {
        status.textContent = `Uploading photo ${i + 1}/${selected.length}…`;
        const url = await uploadFileToCloudinary(selected[i]);
        if (epoch !== sessionEpoch) return;
        if (url && !pendingImageUrls.includes(url)) pendingImageUrls.push(url);
        renderPendingImages();
      }
      status.textContent = `${pendingImageUrls.length} photo${pendingImageUrls.length === 1 ? '' : 's'} ready for AI`;
    } catch (err) {
      if (epoch !== sessionEpoch) return;
      showToast(err?.message || 'Could not upload photo');
      status.textContent = 'Photo upload failed';
    } finally {
      if (epoch !== sessionEpoch) return;
      uploading = false;
      if (attach) attach.disabled = false;
      qs('#adminAiSend').disabled = false;
      const input = qs('#adminAiImageInput');
      if (input) input.value = '';
    }
  }

  async function sendMessage() {
    if (busy || uploading) return;
    const input = qs('#adminAiInput');
    const send = qs('#adminAiSend');
    const status = qs('#adminAiStatus');
    const message = String(input?.value || '').trim();
    if (!message) return;
    if (!API_URL || !ADMIN_KEY || !ADMIN_PROFILE) {
      showToast('Connect to the admin backend first');
      return;
    }
    const epoch = sessionEpoch;
    const history = messages.slice(-CONTEXT_MESSAGES).map(({ role, text, images }) => ({ role, text, images: images || [] }));
    const productDraft = currentProposal?.type === 'add_product' ? readProposalEdits(currentProposal).patch : null;
    const imageUrls = pendingImageUrls.slice();
    addMessage('user', message, imageUrls);
    input.value = '';
    pendingImageUrls = [];
    renderPendingImages();
    autoSizeInput();
    renderProposal(null);
    busy = true;
    send.disabled = true;
    qs('#adminAiAttach').disabled = true;
    qs('#adminAiClear').disabled = false;
    status.textContent = 'Working with live shop data…';
    qs('#adminAiDrawer')?.classList.add('thinking');
    try {
      const res = await adminFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          key: ADMIN_KEY,
          action: 'aiAdminChat',
          message,
          history,
          sessionState: collectAiSessionState(),
          productDraft,
          requestedModel: qs('#adminAiModel')?.value || '',
          reasoningEffort: qs('#adminAiQuality')?.value || 'low',
          imageUrls
        }),
        timeoutMs: 120000
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      if (epoch !== sessionEpoch) return;
      addMessage('assistant', data.reply || 'No reply returned.');
      renderProposal(data.proposal || null);
      status.textContent = data.elapsedMs ? `${data.model || 'AI'} · ${(data.elapsedMs / 1000).toFixed(1)}s` : (data.model || 'Ready');
    } catch (err) {
      if (epoch !== sessionEpoch) return;
      addMessage('assistant', `I couldn't complete that request: ${err?.message || err}`);
      pendingImageUrls = imageUrls;
      renderPendingImages();
      if (!input.value) input.value = message;
      status.textContent = 'Request failed — you can retry';
    } finally {
      if (epoch !== sessionEpoch) return;
      busy = false;
      send.disabled = false;
      qs('#adminAiAttach').disabled = false;
      qs('#adminAiClear').disabled = false;
      qs('#adminAiDrawer')?.classList.remove('thinking');
      if (qs('#adminAiDrawer')?.classList.contains('open')) input.focus({ preventScroll: true });
    }
  }

  function autoSizeInput() {
    const input = qs('#adminAiInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  }


  document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    renderMessages();
    renderPendingImages();
    qs('#adminAiTools')?.addEventListener('change', e => {
      const prompts = {
        enrich: 'Find [product name or ID] and enrich its details.',
        hindi: 'Translate the description for [product name or ID] into Hindi.',
        seo: 'Improve SEO description and tags for [product name or ID].',
        caption: 'Draft a short Instagram caption for [product name or ID] using confirmed facts. Do not publish.',
        audit: 'Audit catalog quality and listing gaps.',
        restock: 'Show a restock report.'
      };
      if (prompts[e.target.value]) {
        const input = qs('#adminAiInput');
        input.value = prompts[e.target.value];
        autoSizeInput();
        if (qs('#adminAiDrawer')?.classList.contains('open')) input.focus({ preventScroll: true });
        const start = input.value.indexOf('[');
        if (start !== -1) input.setSelectionRange(start, input.value.indexOf(']') + 1);
      }
      e.target.value = '';
    });
    qs('#adminAiCopy')?.addEventListener('click', async () => {
      const last = messages.slice().reverse().find(m => m.role === 'assistant');
      if (!last) return showToast('No reply to copy yet');
      try { await navigator.clipboard.writeText(last.text); showToast('Reply copied'); }
      catch (_) { showToast('Copy unavailable. Select the reply text to copy it.'); }
    });
    qs('#adminAiOpen')?.addEventListener('click', openChat);
    qs('#adminAiClose')?.addEventListener('click', closeChat);
    qs('#adminAiBackdrop')?.addEventListener('click', closeChat);

    // Drawer behavior: tapping/clicking anywhere outside DSB AI closes it.
    // Use pointerdown so the same tap can continue to the admin control underneath.
    document.addEventListener('pointerdown', (event) => {
      const drawer = qs('#adminAiDrawer');
      if (!drawer?.classList.contains('open')) return;
      if (drawer.contains(event.target) || qs('#adminAiOpen')?.contains(event.target)) return;
      closeChat({ restoreFocus: false });
    });
    qs('#adminAiClear')?.addEventListener('click', clearSession);
    qs('#adminAiNew')?.addEventListener('click', clearSession);
    qs('#adminAiSend')?.addEventListener('click', sendMessage);
    qs('#adminAiAttach')?.addEventListener('click', () => qs('#adminAiImageInput')?.click());
    qs('#adminAiImageInput')?.addEventListener('change', e => attachImages(e.target.files));
    qs('#adminAiInput')?.addEventListener('input', autoSizeInput);
    qs('#adminAiInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab' && qs('#adminAiDrawer')?.classList.contains('open')) {
        const controls = qsa('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled)', qs('#adminAiDrawer')).filter(el => !el.hidden && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === 'Escape' && qs('#adminAiDrawer')?.classList.contains('open')) closeChat();
    });
  });

})();
