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
