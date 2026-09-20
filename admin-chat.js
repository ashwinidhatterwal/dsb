/* DSB Admin AI chat — session memory + confirmation-first admin actions. */
(() => {
  'use strict';
  const STORAGE_KEY = 'dsb_admin_ai_chat_v1';
  const MAX_MESSAGES = 18;
  let messages = [];
  let busy = false;
  let currentProposal = null;
  let pendingImageUrls = [];

  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => Array.from(c.querySelectorAll(s));

  function loadSession() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) messages = parsed.filter(x => x && ['user', 'assistant'].includes(x.role) && typeof x.text === 'string').map(x => ({ role: x.role, text: x.text, images: Array.isArray(x.images) ? x.images.filter(u => /^https:\/\//i.test(String(u || ''))).slice(0, 5) : [] })).slice(-MAX_MESSAGES);
    } catch (_) { messages = []; }
  }
  function saveSession() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (_) {}
  }
  function addMessage(role, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    messages.push({ role, text: clean });
    messages = messages.slice(-MAX_MESSAGES);
    saveSession();
    renderMessages();
  }
  function clearSession() {
    messages = [];
    currentProposal = null;
    saveSession();
    renderMessages();
    renderProposal(null);
    qs('#adminAiInput')?.focus();
  }

  function openChat() {
    const drawer = qs('#adminAiDrawer');
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-ai-open');
    renderMessages();
    setTimeout(() => qs('#adminAiInput')?.focus(), 30);
  }
  function closeChat() {
    const drawer = qs('#adminAiDrawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-ai-open');
  }

  function renderMessages() {
    const root = qs('#adminAiMessages');
    if (!root) return;
    if (!messages.length) {
      root.innerHTML = `<div class="admin-ai-welcome">
        <div class="admin-ai-orb">✦</div>
        <strong>AI Copilot</strong>
        <p>Work with products, orders, stock and sales in one conversation. Product enrichment can use the listing photo, and every admin change is reviewed before apply.</p>
        <div class="admin-ai-prompts">
          <button type="button" data-prompt="Summarize the shop today.">Today's summary</button>
          <button type="button" data-prompt="Show me the products that need restocking.">Low stock</button>
          <button type="button" data-prompt="Which products are missing a Hindi description?">Hindi gaps</button>
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
      return `<div class="admin-ai-msg ${m.role}"><div>${thumbs}${escapeHtml(m.text).replace(/\n/g, '<br>')}</div></div>`;
    }).join('');
    root.scrollTop = root.scrollHeight;
  }

  function proposalLabel(proposal) {
    if (!proposal) return '';
    if (proposal.type === 'update_product') return 'Product edit';
    if (proposal.type === 'add_product') return 'New product';
    if (proposal.type === 'update_order_status') return 'Order status';
    if (proposal.type === 'archive_product') return proposal.archived ? 'Archive product' : 'Restore product';
    return 'Admin action';
  }
  function displayValue(value) {
    if (value === '' || value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  function renderProposal(proposal) {
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
        return `<div class="admin-ai-change"><span>${escapeHtml(key)}</span><del>${escapeHtml(displayValue(before))}</del><strong>${escapeHtml(displayValue(next))}</strong></div>`;
      }).join('');
      detail = `<div class="admin-ai-changes">${rows}</div>`;
    } else if (proposal.type === 'add_product') {
      detail = `<div class="admin-ai-changes">${Object.entries(proposal.patch || {}).map(([key, value]) => `<div class="admin-ai-change single"><span>${escapeHtml(key)}</span><strong>${escapeHtml(displayValue(value))}</strong></div>`).join('')}</div>`;
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
    wrap.scrollIntoView({ block: 'nearest', behavior: reducedMotion?.() ? 'auto' : 'smooth' });
  }

  function armProposalApply() {
    const btn = qs('#adminAiApplyProposal');
    if (!btn || btn.dataset.armed === '1') return applyProposal();
    btn.dataset.armed = '1';
    btn.textContent = 'Confirm apply';
    btn.classList.add('armed');
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.dataset.armed = '';
      btn.textContent = 'Apply';
      btn.classList.remove('armed');
    }, 6000);
  }

  async function applyProposal() {
    const proposal = currentProposal;
    const btn = qs('#adminAiApplyProposal');
    if (!proposal || !btn || busy) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
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
      busy = false;
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
    const list = Array.from(files || []).filter(file => file && /^image\//i.test(file.type));
    if (!list.length) return;
    const room = Math.max(0, 5 - pendingImageUrls.length);
    if (!room) return showToast('Up to 5 AI reference photos per message');
    if (typeof uploadFileToCloudinary !== 'function') return showToast('Image upload helper is unavailable');
    const attach = qs('#adminAiAttach');
    const status = qs('#adminAiStatus');
    if (attach) attach.disabled = true;
    try {
      const selected = list.slice(0, room);
      for (let i = 0; i < selected.length; i++) {
        status.textContent = `Uploading photo ${i + 1}/${selected.length}…`;
        const url = await uploadFileToCloudinary(selected[i]);
        if (url && !pendingImageUrls.includes(url)) pendingImageUrls.push(url);
        renderPendingImages();
      }
      status.textContent = `${pendingImageUrls.length} photo${pendingImageUrls.length === 1 ? '' : 's'} ready for AI`;
    } catch (err) {
      showToast(err?.message || 'Could not upload photo');
      status.textContent = 'Photo upload failed';
    } finally {
      if (attach) attach.disabled = false;
      const input = qs('#adminAiImageInput');
      if (input) input.value = '';
    }
  }

  async function sendMessage() {
    if (busy) return;
    const input = qs('#adminAiInput');
    const send = qs('#adminAiSend');
    const status = qs('#adminAiStatus');
    const message = String(input?.value || '').trim();
    if (!message) return;
    if (!API_URL || !ADMIN_KEY || !ADMIN_PROFILE) {
      showToast('Connect to the admin backend first');
      return;
    }
    const history = messages.slice(-14).map(({ role, text }) => ({ role, text }));
    const imageUrls = pendingImageUrls.slice();
    addMessage('user', message, imageUrls);
    input.value = '';
    pendingImageUrls = [];
    renderPendingImages();
    autoSizeInput();
    renderProposal(null);
    busy = true;
    send.disabled = true;
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
          requestedModel: qs('#adminAiModel')?.value || '',
          reasoningEffort: qs('#adminAiQuality')?.value || 'low',
          imageUrls
        }),
        timeoutMs: 120000
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      addMessage('assistant', data.reply || 'No reply returned.');
      renderProposal(data.proposal || null);
      status.textContent = data.elapsedMs ? `${data.model || 'AI'} · ${(data.elapsedMs / 1000).toFixed(1)}s` : (data.model || 'Ready');
    } catch (err) {
      addMessage('assistant', `I couldn't complete that request: ${err?.message || err}`);
      status.textContent = 'Request failed';
    } finally {
      busy = false;
      send.disabled = false;
      qs('#adminAiDrawer')?.classList.remove('thinking');
      input.focus();
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
    qs('#adminAiOpen')?.addEventListener('click', openChat);
    qs('#adminAiClose')?.addEventListener('click', closeChat);
    qs('#adminAiClear')?.addEventListener('click', clearSession);
    qs('#adminAiSend')?.addEventListener('click', sendMessage);
    qs('#adminAiAttach')?.addEventListener('click', () => qs('#adminAiImageInput')?.click());
    qs('#adminAiImageInput')?.addEventListener('change', e => attachImages(e.target.files));
    qs('#adminAiInput')?.addEventListener('input', autoSizeInput);
    qs('#adminAiInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && qs('#adminAiDrawer')?.classList.contains('open')) closeChat();
    });
  });
})();
