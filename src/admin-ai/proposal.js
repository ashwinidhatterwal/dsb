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
