let pendingResumeBatch=null;
async function sendMessage() {
  if (busy || uploading) return;
  const input = qs('#adminAiInput');
  const send = qs('#adminAiSend');
  const status = qs('#adminAiStatus');
  const message = String(input?.value || '').trim();
  qs('#aiContinueBatch')?.remove();
  if (!message) return;
  if (!API_URL || !ADMIN_KEY || !ADMIN_PROFILE) {
    showToast('Connect to the admin backend first');
    return;
  }
  const resumeBatch=pendingResumeBatch?.message===message?pendingResumeBatch.batch:null;pendingResumeBatch=null;
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
        resumeBatch,
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
    qs('#aiContinueBatch')?.remove();
    if(data.continuation?.ids?.length){
      const button=document.createElement('button');button.id='aiContinueBatch';button.type='button';button.className='ghost-btn';button.textContent='Continue remaining products';
      button.addEventListener('click',()=>{input.value='Analyze these product IDs: '+data.continuation.ids.join(', ')+'. Instruction: '+data.continuation.instruction+(data.continuation.onlyEmpty?' Only fill empty fields.':'');pendingResumeBatch={message:input.value,batch:data.continuation};button.remove();autoSizeInput();input.focus();});
      status.parentElement.appendChild(button);
    }
    status.textContent = data.elapsedMs ? `${data.model || 'AI'} · ${(data.elapsedMs / 1000).toFixed(1)}s` : (data.model || 'Ready');
    if(data.usage)status.textContent+=' · '+data.usage.providerCalls+' provider calls'+(data.usage.inputTokens==null?' · token usage unavailable':' · '+data.usage.inputTokens+' input / '+data.usage.outputTokens+' output tokens'+(data.usage.partial?' (partial)':''));
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
