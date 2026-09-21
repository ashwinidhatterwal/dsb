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
        modelConfigId: qs('#adminAiModel')?.value || '',
        reasoningEffort: qs('#adminAiQuality')?.value || '',
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
