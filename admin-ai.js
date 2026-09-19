/* DSB AI product draft UI
 * Keeps OpenAI calls server-side through the authenticated Apps Script backend.
 * The generated draft is always handed to the existing review-first autofill UI.
 */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const MAX_REFERENCE_IMAGES = 5;
  let busy = false;
  let aiReferenceUrls = [];

  function updateImageState() {
    const imageUrl = $('#f-image')?.value.trim();
    const file = $('#f-imagefile')?.files?.[0];
    const refCount = aiReferenceUrls.length;
    const base = imageUrl
      ? '✓ Current product image will be analysed.'
      : file
        ? '✓ Selected photo will be uploaded first, then analysed.'
        : 'No main product photo selected. AI can still use your notes, reference photos, and any fields already filled in.';
    $('#aiImageState').textContent = refCount
      ? `${base} ${refCount} AI-only reference photo${refCount === 1 ? '' : 's'} added.`
      : base;
  }

  function openDialog() {
    const dialog = $('#aiProductDialog');
    if (!dialog) return;
    updateImageState();
    $('#aiStatus').textContent = '';
    renderReferencePreview();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => $('#aiProductNotes')?.focus(), 0);
  }

  function closeDialog() {
    const dialog = $('#aiProductDialog');
    if (!dialog || busy) return;
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
    $('#aiImageState').textContent = 'Uploading the selected photo…';
    imageUrl = await uploadFileToCloudinary(file);
    $('#f-image').value = imageUrl;
    if (typeof updateImagePreview === 'function') updateImagePreview(imageUrl);
    fileInput.value = '';
    $('#uploadStatus').textContent = 'Photo uploaded.';
    updateImageState();
    return imageUrl;
  }

  function setBusy(on) {
    busy = on;
    const button = $('#aiGenerateBtn');
    if (button) {
      button.disabled = on;
      button.textContent = on ? 'Generating…' : 'Generate product draft';
    }
    $('#aiCloseBtn')?.toggleAttribute('disabled', on);
    $('#aiRefUploadBtn')?.toggleAttribute('disabled', on);
    $('#aiRefAddUrlBtn')?.toggleAttribute('disabled', on);
    $('#aiRefClearBtn')?.toggleAttribute('disabled', on);
  }

  function renderReferencePreview() {
    const box = $('#aiReferencePreview');
    if (!box) return;
    if (!aiReferenceUrls.length) {
      box.innerHTML = '<p class="hint" style="margin:0;">No extra AI-only reference photos added.</p>';
    } else {
      box.innerHTML = aiReferenceUrls.map((url, i) => `
        <div class="extra-thumb">
          <img src="${escapeHtml(url)}" alt="Reference photo ${i + 1}" loading="lazy" decoding="async">
          <button type="button" data-i="${i}" aria-label="Remove reference photo">✕</button>
        </div>
      `).join('');
      box.querySelectorAll('button[data-i]').forEach(btn => btn.addEventListener('click', () => {
        aiReferenceUrls.splice(Number(btn.dataset.i), 1);
        renderReferencePreview();
        updateImageState();
      }));
    }
    const countEl = $('#aiReferenceCount');
    if (countEl) countEl.textContent = aiReferenceUrls.length ? `${aiReferenceUrls.length}/${MAX_REFERENCE_IMAGES} added` : 'Optional';
  }

  function pushReferenceUrl(url) {
    const cleaned = String(url || '').trim();
    if (!cleaned) return false;
    if (!/^https:\/\//i.test(cleaned)) throw new Error('Reference images must use HTTPS URLs.');
    if (aiReferenceUrls.includes(cleaned)) return false;
    if (aiReferenceUrls.length >= MAX_REFERENCE_IMAGES) throw new Error(`You can add up to ${MAX_REFERENCE_IMAGES} AI-only reference photos.`);
    aiReferenceUrls.push(cleaned);
    renderReferencePreview();
    updateImageState();
    return true;
  }

  async function uploadReferenceImage() {
    if (busy) return;
    const statusEl = $('#aiRefStatus');
    const fileInput = $('#aiRefFile');
    const file = fileInput?.files?.[0];
    if (!file) {
      statusEl.className = 'statusline bad';
      statusEl.textContent = 'Choose a reference photo first.';
      return;
    }
    const btn = $('#aiRefUploadBtn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    statusEl.className = 'statusline';
    statusEl.textContent = 'Uploading reference photo…';
    try {
      if (typeof uploadFileToCloudinary !== 'function') throw new Error('Image upload helper is unavailable.');
      const url = await uploadFileToCloudinary(file);
      pushReferenceUrl(url);
      statusEl.className = 'statusline ok';
      statusEl.textContent = 'Reference photo added for AI.';
      fileInput.value = '';
    } catch (err) {
      statusEl.className = 'statusline bad';
      statusEl.textContent = err?.message || String(err);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function addReferenceUrl() {
    if (busy) return;
    const statusEl = $('#aiRefStatus');
    const input = $('#aiRefUrl');
    try {
      if (!input?.value?.trim()) throw new Error('Paste a reference photo URL first.');
      const added = pushReferenceUrl(input.value);
      statusEl.className = added ? 'statusline ok' : 'statusline';
      statusEl.textContent = added ? 'Reference photo added for AI.' : 'That reference photo is already added.';
      input.value = '';
    } catch (err) {
      statusEl.className = 'statusline bad';
      statusEl.textContent = err?.message || String(err);
    }
  }

  function clearReferencePhotos() {
    if (busy) return;
    aiReferenceUrls = [];
    renderReferencePreview();
    updateImageState();
    const statusEl = $('#aiRefStatus');
    if (statusEl) {
      statusEl.className = 'statusline';
      statusEl.textContent = '';
    }
  }


  function aiOptimizedImageUrl(url) {
    const value = String(url || '').trim();
    if (!value || !/res\.cloudinary\.com/i.test(value) || !/\/upload\//.test(value)) return value;
    if (/\/upload\/f_auto,q_auto:eco,w_1280,c_limit\//.test(value)) return value;
    return value.replace('/upload/', '/upload/f_auto,q_auto:eco,w_1280,c_limit/');
  }

  function startProgress(statusEl, imageCount) {
    const started = Date.now();
    const phases = [
      [0, 'Preparing request'],
      [2, imageCount ? 'Analysing product photo' : 'Reading product details'],
      [8, 'Identifying useful product details'],
      [16, 'Preparing English and Hindi content'],
      [28, 'Validating structured product fields'],
      [42, 'Waiting for the AI provider to finish']
    ];
    let timer = null;

    const render = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      let phase = phases[0][1];
      for (const [after, label] of phases) if (elapsed >= after) phase = label;
      statusEl.className = 'statusline ai-live-progress';
      statusEl.innerHTML = `<div class="ai-progress-head"><strong>${escapeHtml(phase)}</strong><span>${elapsed}s elapsed</span></div><div class="ai-progress-track" aria-hidden="true"><span></span></div><small>${imageCount ? `${imageCount} image${imageCount === 1 ? '' : 's'} · ` : ''}Generating a concise product draft. This timer is real; the bar is activity, not a fake percentage.</small>`;
    };
    render();
    timer = setInterval(render, 1000);
    return () => { if (timer) clearInterval(timer); timer = null; };
  }

  function selectedAiModel() {
    const selected = document.querySelector('input[name="aiModel"]:checked');
    const model = String(selected?.value || 'gemini-3.5-flash-lite').trim().toLowerCase();
    const allowed = new Set(['gemini-3.8-flash', 'gemini-3-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
    return allowed.has(model) ? model : 'gemini-3.5-flash-lite';
  }

  function selectedReasoningEffort() {
    const selected = document.querySelector('input[name="aiQuality"]:checked');
    const effort = String(selected?.value || 'low').toLowerCase();
    return /^(low|medium|high)$/.test(effort) ? effort : 'low';
  }

  async function generateDraft() {
    if (busy) return;
    const statusEl = $('#aiStatus');
    let stopProgress = null;
    setBusy(true);
    statusEl.className = 'statusline';
    statusEl.textContent = 'Preparing product information…';
    try {
      if (!API_URL || !ADMIN_KEY) throw new Error('Connect to the admin backend first.');
      const imageUrl = await ensureImageUrl();
      const referenceUrls = aiReferenceUrls.slice();
      const notes = $('#aiProductNotes').value.trim();
      const existing = currentProductFacts();
      const reasoningEffort = selectedReasoningEffort();
      const requestedModel = selectedAiModel();
      if (!imageUrl && !referenceUrls.length && !notes && !Object.keys(existing).length) {
        throw new Error('Add a product photo, AI-only reference photo, a short note, or fill at least one product field first.');
      }

      // Send lightweight Cloudinary derivatives only to AI. Product/storefront URLs stay untouched.
      const aiImageUrl = aiOptimizedImageUrl(imageUrl);
      const optimizedReferenceUrls = referenceUrls.map(aiOptimizedImageUrl);
      const imageCount = (aiImageUrl ? 1 : 0) + optimizedReferenceUrls.length;
      stopProgress = startProgress(statusEl, imageCount);
      statusEl.dataset.quality = reasoningEffort;

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
          reasoningEffort,
          requestedModel
        }),
        timeoutMs: 120000
      });
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      if (!data?.success || !data.draft || typeof data.draft !== 'object') throw new Error('AI returned an unexpected response.');
      if (!window.DSBAutofill?.openDraft) throw new Error('Autofill review tool is unavailable. Refresh the admin page and retry.');

      stopProgress?.();
      stopProgress = null;
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      statusEl.className = 'statusline good';
      statusEl.textContent = `Draft ready${data.elapsedMs ? ` in ${(data.elapsedMs / 1000).toFixed(1)}s` : ''}. Opening review…`;
      const dialog = $('#aiProductDialog');
      if (typeof dialog?.close === 'function' && dialog.open) dialog.close();
      else dialog?.removeAttribute('open');
      window.DSBAutofill.openDraft(data.draft, {
        source: 'AI generated draft',
        warnings,
        model: data.model || ''
      });
    } catch (err) {
      stopProgress?.();
      stopProgress = null;
      statusEl.className = 'statusline bad';
      const message = err?.message || String(err);
      if (/timeout|timed out|aborted/i.test(message)) {
        statusEl.textContent = 'The AI provider took too long (over about 120 seconds). Try again, use a faster model, or reduce reference photos.';
      } else {
        statusEl.textContent = /unknown action/i.test(message)
          ? 'AI backend is not deployed yet. Update Apps Script with the latest code.gs and redeploy the web app, then reconnect the admin panel.'
          : message;
      }
    } finally {
      stopProgress?.();
      setBusy(false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#aiGenerateOpenBtn')?.addEventListener('click', openDialog);
    $('#aiCloseBtn')?.addEventListener('click', closeDialog);
    $('#aiGenerateBtn')?.addEventListener('click', generateDraft);
    $('#aiRefUploadBtn')?.addEventListener('click', uploadReferenceImage);
    $('#aiRefAddUrlBtn')?.addEventListener('click', addReferenceUrl);
    $('#aiRefClearBtn')?.addEventListener('click', clearReferencePhotos);
    $('#f-image')?.addEventListener('input', updateImageState);
    $('#f-imagefile')?.addEventListener('change', updateImageState);
    $('#aiProductDialog')?.addEventListener('click', event => {
      if (event.target === $('#aiProductDialog')) closeDialog();
    });
    renderReferencePreview();
    updateImageState();
  });

  window.DSBAIProductAssist = Object.freeze({
    resetReferencePhotos: clearReferencePhotos
  });
})();
