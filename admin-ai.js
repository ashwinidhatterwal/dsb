/* DSB unified AI product panel
 * One subtle entry point that replaces the old three-way split
 * (Generate with AI / Paste from ChatGPT / open the AI chatbox).
 * The same box accepts a pasted table/JSON *or* freeform instructions:
 * structured input is parsed and applied instantly; freeform input (or a
 * photo with no text) is sent to the AI, which returns a draft applied the
 * same way. Either path fills the live form directly and closes itself so
 * the fields can be reviewed in place - nothing is saved automatically.
 */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const MAX_REFERENCE_IMAGES = 5;
  let busy = false;
  let aiReferenceUrls = [];

  function openDialog() {
    if (window.DSBAIConfig && !window.DSBAIConfig.state.models.length) window.DSBAIConfig.loadModels().catch(() => {});
    const dialog = $('#aiFillDialog');
    if (!dialog) return;
    $('#aiFillStatus').textContent = '';
    renderReferencePreview();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => $('#aiFillInput')?.focus(), 0);
  }

  function closeDialog({ force = false } = {}) {
    const dialog = $('#aiFillDialog');
    if (!dialog || (busy && !force)) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function value(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function currentProductFacts() {
    const out = {};
    const fields = {
      name: 'f-name', namehindi: 'f-nameHindi', category: 'f-category', subcategory: 'f-subcategory',
      price: 'f-price', mrp: 'f-mrp', costprice: 'f-costprice', description: 'f-description',
      stock: 'f-stock', stockqty: 'f-stockqty', brand: 'f-brand', material: 'f-material',
      packsize: 'f-packsize', specifications: 'f-specifications', gtin: 'f-gtin',
      descriptionhindi: 'f-descriptionhindi', sizes: 'f-sizes', sizeprices: 'f-sizeprices', tags: 'f-tags'
    };
    for (const [key, id] of Object.entries(fields)) {
      const v = value(id);
      if (v) out[key] = v;
    }
    const hasSizes = $('#f-hasSizes');
    if (hasSizes?.checked) out.hasSizes = true;
    return out;
  }

  async function ensureImageUrl() {
    let imageUrl = value('f-image');
    if (imageUrl) return imageUrl;
    const fileInput = $('#f-imagefile');
    const file = fileInput?.files?.[0];
    if (!file) return '';
    if (typeof uploadFileToCloudinary !== 'function') throw new Error('Image upload helper is unavailable. Upload the photo first and retry.');
    const statusEl = $('#aiFillStatus');
    statusEl.textContent = 'Uploading photo…';
    imageUrl = await uploadFileToCloudinary(file);
    $('#f-image').value = imageUrl;
    if (typeof updateImagePreview === 'function') updateImagePreview(imageUrl);
    fileInput.value = '';
    $('#uploadStatus').textContent = 'Photo uploaded.';
    return imageUrl;
  }

  function setBusy(on) {
    busy = on;
    const button = $('#aiFillBtn');
    if (button) {
      button.disabled = on;
      button.textContent = on ? 'Working…' : '✦ Fill form';
    }
    $('#aiFillCloseBtn')?.toggleAttribute('disabled', on);
    $('#aiRefUploadBtn')?.toggleAttribute('disabled', on);
    $('#aiRefAddUrlBtn')?.toggleAttribute('disabled', on);
    $('#aiRefClearBtn')?.toggleAttribute('disabled', on);
  }

  function renderReferencePreview() {
    const box = $('#aiReferencePreview');
    if (!box) return;
    if (!aiReferenceUrls.length) {
      box.innerHTML = '';
      box.hidden = true;
    } else {
      box.hidden = false;
      box.innerHTML = aiReferenceUrls.map((url, i) => `
        <div class="extra-thumb">
          <img src="${escapeHtml(url)}" alt="Reference photo ${i + 1}" loading="lazy" decoding="async">
          <button type="button" data-i="${i}" aria-label="Remove reference photo">✕</button>
        </div>
      `).join('');
      box.querySelectorAll('button[data-i]').forEach(btn => btn.addEventListener('click', () => {
        aiReferenceUrls.splice(Number(btn.dataset.i), 1);
        renderReferencePreview();
      }));
    }
    const countEl = $('#aiReferenceCount');
    if (countEl) countEl.textContent = aiReferenceUrls.length ? `${aiReferenceUrls.length}/${MAX_REFERENCE_IMAGES}` : '';
  }

  function pushReferenceUrl(url) {
    const cleaned = String(url || '').trim();
    if (!cleaned) return false;
    if (!/^https:\/\//i.test(cleaned)) throw new Error('Reference images must use HTTPS URLs.');
    if (aiReferenceUrls.includes(cleaned)) return false;
    if (aiReferenceUrls.length >= MAX_REFERENCE_IMAGES) throw new Error(`Up to ${MAX_REFERENCE_IMAGES} reference photos.`);
    aiReferenceUrls.push(cleaned);
    renderReferencePreview();
    return true;
  }

  async function uploadReferenceImage() {
    if (busy) return;
    const statusEl = $('#aiFillStatus');
    const fileInput = $('#aiRefFile');
    const file = fileInput?.files?.[0];
    if (!file) { statusEl.className = 'statusline bad'; statusEl.textContent = 'Choose a photo first.'; return; }
    const btn = $('#aiRefUploadBtn');
    btn.disabled = true;
    try {
      if (typeof uploadFileToCloudinary !== 'function') throw new Error('Image upload helper is unavailable.');
      statusEl.className = 'statusline';
      statusEl.textContent = 'Uploading…';
      const url = await uploadFileToCloudinary(file);
      pushReferenceUrl(url);
      statusEl.className = 'statusline ok';
      statusEl.textContent = 'Photo added.';
      fileInput.value = '';
    } catch (err) {
      statusEl.className = 'statusline bad';
      statusEl.textContent = err?.message || String(err);
    } finally {
      btn.disabled = false;
    }
  }

  function addReferenceUrl() {
    if (busy) return;
    const statusEl = $('#aiFillStatus');
    const input = $('#aiRefUrl');
    try {
      if (!input?.value?.trim()) throw new Error('Paste a photo URL first.');
      const added = pushReferenceUrl(input.value);
      statusEl.className = added ? 'statusline ok' : 'statusline';
      statusEl.textContent = added ? 'Photo added.' : 'Already added.';
      input.value = '';
    } catch (err) {
      statusEl.className = 'statusline bad';
      statusEl.textContent = err?.message || String(err);
    }
  }

  function clearReferencePhotos() {
    aiReferenceUrls = [];
    renderReferencePreview();
  }

  function aiOptimizedImageUrl(url) {
    const v = String(url || '').trim();
    if (!v || !/res\.cloudinary\.com/i.test(v) || !/\/upload\//.test(v)) return v;
    if (/\/upload\/f_auto,q_auto:eco,w_1280,c_limit\//.test(v)) return v;
    return v.replace('/upload/', '/upload/f_auto,q_auto:eco,w_1280,c_limit/');
  }

  function selectedAiModelConfigId() {
    return String($('#aiFillModel')?.value || '').trim();
  }

  function selectedReasoningEffort() {
    return String($('#aiFillEffort')?.value || '').trim().toLowerCase();
  }

  function startProgress(statusEl, imageCount) {
    const started = Date.now();
    const phases = [
      [0, 'Preparing request'],
      [2, imageCount ? 'Analysing photo' : 'Reading details'],
      [8, 'Identifying product details'],
      [16, 'Preparing content'],
      [28, 'Validating fields'],
      [42, 'Waiting for the AI provider']
    ];
    let timer = null;
    const render = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      let phase = phases[0][1];
      for (const [after, label] of phases) if (elapsed >= after) phase = label;
      statusEl.className = 'statusline ai-live-progress';
      statusEl.innerHTML = `<div class="ai-progress-head"><strong>${escapeHtml(phase)}</strong><span>${elapsed}s</span></div><div class="ai-progress-track" aria-hidden="true"><span></span></div>`;
    };
    render();
    timer = setInterval(render, 1000);
    return () => { if (timer) clearInterval(timer); timer = null; };
  }

  // Briefly highlights each filled field in sequence so it visibly reads as
  // the assistant moving through and editing the form, not a silent bulk-set.
  function animateTouchedFields(ids) {
    const unique = [...new Set(ids)].filter(id => document.getElementById(id));
    unique.forEach((id, i) => {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('ai-just-filled');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => el.classList.remove('ai-just-filled'), 900);
      }, i * 90);
    });
  }

  async function requestAiDraft(notes) {
    if (!API_URL || !ADMIN_KEY) throw new Error('Connect to the admin backend first.');
    const statusEl = $('#aiFillStatus');
    const imageUrl = await ensureImageUrl();
    const referenceUrls = aiReferenceUrls.slice();
    const existing = currentProductFacts();
    if (!imageUrl && !referenceUrls.length && !notes && !Object.keys(existing).length) {
      throw new Error('Add a photo, a short note, or fill at least one field first.');
    }
    const aiImageUrl = aiOptimizedImageUrl(imageUrl);
    const optimizedReferenceUrls = referenceUrls.map(aiOptimizedImageUrl);
    const imageCount = (aiImageUrl ? 1 : 0) + optimizedReferenceUrls.length;
    const stopProgress = startProgress(statusEl, imageCount);
    try {
      const response = await adminFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          key: ADMIN_KEY,
          action: 'aiProductDraft',
          imageUrl: aiImageUrl,
          referenceUrls: optimizedReferenceUrls,
          notes,
          existing,
          reasoningEffort: selectedReasoningEffort(),
          modelConfigId: selectedAiModelConfigId()
        }),
        timeoutMs: 120000
      });
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      if (!data?.success || !data.draft || typeof data.draft !== 'object') throw new Error('AI returned an unexpected response.');
      return data;
    } finally {
      stopProgress();
    }
  }

  async function fillForm() {
    if (busy) return;
    const statusEl = $('#aiFillStatus');
    setBusy(true);
    statusEl.className = 'statusline';
    statusEl.textContent = '';
    try {
      const raw = $('#aiFillInput').value.trim();

      // Structured input (JSON / "Label: value" lines / a copied table) is
      // applied straight away - this is the old "paste from ChatGPT" path,
      // now folded silently into the same box.
      const parsed = window.DSBAutofill?.tryParseInput?.(raw);
      let draft, meta;
      if (parsed) {
        draft = parsed;
        meta = { source: 'Parsed from pasted text' };
      } else {
        // Freeform notes, an instruction, or just a photo with no text -
        // ask the AI to generate the draft instead.
        statusEl.textContent = 'Asking AI…';
        const data = await requestAiDraft(raw);
        draft = window.DSBAutofill.canonicalize(data.draft);
        meta = { source: 'AI generated', warnings: data.warnings, model: data.model };
      }

      if (!draft || !Object.keys(draft).length) throw new Error('Nothing usable came back. Try adding a photo or a bit more detail.');

      const touched = window.DSBAutofill.applyToForm(draft);
      // Successful generation is complete: close immediately so the admin
      // can review the populated form without manually dismissing AI.
      closeDialog({ force: true });
      animateTouchedFields(touched);
      const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean) : [];
      const count = Object.keys(draft).length;
      if (typeof showToast === 'function') {
        showToast(`AI filled ${count} field${count === 1 ? '' : 's'}${warnings.length ? ' — check the notes below' : ''}. Review before saving.`);
      }
    } catch (err) {
      const message = err?.message || String(err);
      statusEl.className = 'statusline bad';
      if (/timeout|timed out|aborted/i.test(message)) {
        statusEl.textContent = 'The AI provider took too long. Try again or use a faster model.';
      } else {
        statusEl.textContent = /unknown action/i.test(message)
          ? 'AI backend is not deployed yet. Update Apps Script and reconnect.'
          : message;
      }
    } finally {
      setBusy(false);
    }
  }

  function openChatInstead() {
    closeDialog();
    $('#adminAiOpen')?.click();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#aiFillOpenBtn')?.addEventListener('click', openDialog);
    $('#aiFillCloseBtn')?.addEventListener('click', closeDialog);
    $('#aiFillBtn')?.addEventListener('click', fillForm);
    $('#aiRefUploadBtn')?.addEventListener('click', uploadReferenceImage);
    $('#aiRefAddUrlBtn')?.addEventListener('click', addReferenceUrl);
    $('#aiRefClearBtn')?.addEventListener('click', clearReferencePhotos);
    $('#aiFillChatLink')?.addEventListener('click', openChatInstead);
    $('#aiFillDialog')?.addEventListener('click', event => {
      if (event.target === $('#aiFillDialog')) closeDialog();
    });
    $('#aiFillInput')?.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); fillForm(); }
    });
    renderReferencePreview();
  });

  window.DSBAIProductAssist = Object.freeze({
    resetReferencePhotos: clearReferencePhotos
  });
})();
