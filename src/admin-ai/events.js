
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
