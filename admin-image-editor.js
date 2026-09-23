(() => {
  'use strict';

  const MAX_PREVIEW = 820;
  const MAX_OUTPUT = 1600;
  const targets = [
    { input: 'f-imagefile', upload: 'uploadBtn', label: 'Product photo' },
    { input: 'f-extraimagefile', upload: 'uploadExtraBtn', label: 'Additional photo' }
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const formatBytes = bytes => {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  const formatType = type => ({'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP'}[type] || String(type || 'Image').replace('image/','').toUpperCase());
  const safeBaseName = name => String(name || 'product-photo').replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'product-photo';

  let dialog, canvas, ctx, resultEl;
  let currentInput = null;
  let bitmap = null;
  let sourceFile = null;
  let angle = 0;
  let ratio = 0;
  let crop = null;
  let dragging = false;
  let dragStart = null;
  let preview = { w: 1, h: 1 };

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'image-editor-dialog';
    dialog.id = 'imageEditorDialog';
    dialog.innerHTML = `
      <div class="image-editor-shell">
        <div class="image-editor-head">
          <div><h2>Quick photo edit</h2><p id="imageEditorSource"></p></div>
          <button type="button" class="image-editor-close" aria-label="Close image editor">×</button>
        </div>
        <div class="image-editor-toolbar">
          <button type="button" data-rotate="-90">↶ Rotate left</button>
          <button type="button" data-rotate="90">↷ Rotate right</button>
          <button type="button" data-reset>Reset crop</button>
          <div class="image-editor-ratios" aria-label="Crop ratio"><span>Crop:</span>
            <button type="button" data-ratio="0" class="active">Free</button>
            <button type="button" data-ratio="1">1:1</button>
            <button type="button" data-ratio="0.75">3:4</button>
            <button type="button" data-ratio="1.3333333333">4:3</button>
          </div>
        </div>
        <div class="image-editor-stage-wrap"><div class="image-editor-stage"><canvas class="image-editor-canvas"></canvas></div></div>
        <div class="image-editor-hint">Drag over the photo to choose the crop area. Reset crop keeps the full image.</div>
        <div class="image-editor-foot">
          <div class="image-editor-result" id="imageEditorResult"></div>
          <div class="image-editor-actions"><button type="button" class="image-editor-cancel">Cancel</button><button type="button" class="image-editor-apply">Apply edit</button></div>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    canvas = $('.image-editor-canvas', dialog);
    ctx = canvas.getContext('2d');
    resultEl = $('#imageEditorResult', dialog);

    $('.image-editor-close', dialog).addEventListener('click', closeEditor);
    $('.image-editor-cancel', dialog).addEventListener('click', closeEditor);
    $('.image-editor-apply', dialog).addEventListener('click', applyEdit);
    $('[data-reset]', dialog).addEventListener('click', () => { crop = fullCrop(); render(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) closeEditor(); });
    dialog.addEventListener('close', releaseBitmap);
    dialog.querySelectorAll('[data-rotate]').forEach(btn => btn.addEventListener('click', () => {
      angle = (angle + Number(btn.dataset.rotate) + 360) % 360;
      crop = null;
      render(true);
    }));
    dialog.querySelectorAll('[data-ratio]').forEach(btn => btn.addEventListener('click', () => {
      ratio = Number(btn.dataset.ratio) || 0;
      dialog.querySelectorAll('[data-ratio]').forEach(x => x.classList.toggle('active', x === btn));
      crop = centeredCrop(ratio);
      render();
    }));

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
  }

  function rotatedSize(w, h) {
    return angle % 180 ? { w: h, h: w } : { w, h };
  }

  function fullCrop() { return { x: 0, y: 0, w: preview.w, h: preview.h }; }

  function centeredCrop(r) {
    if (!r) return fullCrop();
    let w = preview.w, h = w / r;
    if (h > preview.h) { h = preview.h; w = h * r; }
    return { x: (preview.w - w) / 2, y: (preview.h - h) / 2, w, h };
  }

  function drawRotated(targetCtx, targetW, targetH, img, degrees) {
    targetCtx.save();
    targetCtx.translate(targetW / 2, targetH / 2);
    targetCtx.rotate(degrees * Math.PI / 180);
    const swap = degrees % 180 !== 0;
    const drawW = swap ? targetH : targetW;
    const drawH = swap ? targetW : targetH;
    targetCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    targetCtx.restore();
  }

  function render(resetCrop = false) {
    if (!bitmap) return;
    const natural = rotatedSize(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_PREVIEW / Math.max(natural.w, natural.h));
    preview = { w: Math.max(1, Math.round(natural.w * scale)), h: Math.max(1, Math.round(natural.h * scale)) };
    canvas.width = preview.w;
    canvas.height = preview.h;
    ctx.clearRect(0, 0, preview.w, preview.h);
    drawRotated(ctx, preview.w, preview.h, bitmap, angle);
    if (!crop || resetCrop) crop = ratio ? centeredCrop(ratio) : fullCrop();
    crop = clampCrop(crop);
    drawCropOverlay();
    updateResultText();
  }

  function clampCrop(c) {
    const min = 8;
    const w = Math.max(min, Math.min(preview.w, c.w));
    const h = Math.max(min, Math.min(preview.h, c.h));
    return { x: Math.max(0, Math.min(preview.w - w, c.x)), y: Math.max(0, Math.min(preview.h - h, c.y)), w, h };
  }

  function drawCropOverlay() {
    if (!crop) return;
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,.48)';
    ctx.beginPath();
    ctx.rect(0, 0, preview.w, preview.h);
    ctx.rect(crop.x, crop.y, crop.w, crop.h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(crop.x + 1, crop.y + 1, Math.max(0, crop.w - 2), Math.max(0, crop.h - 2));
    ctx.restore();
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(preview.w, (e.clientX - rect.left) * preview.w / rect.width)),
      y: Math.max(0, Math.min(preview.h, (e.clientY - rect.top) * preview.h / rect.height))
    };
  }

  function pointerDown(e) {
    if (!bitmap) return;
    dragging = true;
    dragStart = canvasPoint(e);
    canvas.setPointerCapture?.(e.pointerId);
    crop = { x: dragStart.x, y: dragStart.y, w: 1, h: 1 };
  }

  function pointerMove(e) {
    if (!dragging || !dragStart) return;
    const p = canvasPoint(e);
    let dx = p.x - dragStart.x, dy = p.y - dragStart.y;
    let w = Math.abs(dx), h = Math.abs(dy);
    if (ratio) {
      if (w / Math.max(h, 1) > ratio) h = w / ratio;
      else w = h * ratio;
      w = Math.min(w, dragStart.x, preview.w - dragStart.x, Math.max(dragStart.x, preview.w - dragStart.x)) || w;
    }
    let x = dx >= 0 ? dragStart.x : dragStart.x - w;
    let y = dy >= 0 ? dragStart.y : dragStart.y - h;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > preview.w) w = preview.w - x;
    if (y + h > preview.h) h = preview.h - y;
    if (ratio && w > 8 && h > 8) {
      if (w / h > ratio) w = h * ratio; else h = w / ratio;
    }
    crop = clampCrop({ x, y, w: Math.max(8, w), h: Math.max(8, h) });
    render();
  }

  function pointerUp(e) {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    if (!crop || crop.w < 12 || crop.h < 12) crop = ratio ? centeredCrop(ratio) : fullCrop();
    render();
  }

  function updateResultText() {
    if (!bitmap || !crop) return;
    const natural = rotatedSize(bitmap.width, bitmap.height);
    const sx = natural.w / preview.w, sy = natural.h / preview.h;
    const w = Math.max(1, Math.round(crop.w * sx));
    const h = Math.max(1, Math.round(crop.h * sy));
    const outputScale = Math.min(1, MAX_OUTPUT / Math.max(w, h));
    resultEl.textContent = `Result: ${Math.round(w * outputScale)} × ${Math.round(h * outputScale)} px · optimized before upload`;
  }

  async function openEditor(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    ensureDialog();
    releaseBitmap();
    sourceFile = file;
    currentInput = input;
    angle = 0; ratio = 0; crop = null;
    dialog.querySelectorAll('[data-ratio]').forEach(x => x.classList.toggle('active', x.dataset.ratio === '0'));
    $('#imageEditorSource', dialog).textContent = `${file.name} · ${formatBytes(file.size)}`;
    try {
      bitmap = await createImageBitmap(file);
      render(true);
      dialog.showModal();
    } catch (_) {
      alert('This image could not be opened for editing. You can still upload it normally.');
      releaseBitmap();
    }
  }

  async function applyEdit() {
    if (!bitmap || !sourceFile || !currentInput || !crop) return;
    const btn = $('.image-editor-apply', dialog);
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      const natural = rotatedSize(bitmap.width, bitmap.height);
      const px = {
        x: crop.x * natural.w / preview.w,
        y: crop.y * natural.h / preview.h,
        w: crop.w * natural.w / preview.w,
        h: crop.h * natural.h / preview.h
      };
      const fullScale = Math.min(1, MAX_OUTPUT / Math.max(natural.w, natural.h));
      const rotated = document.createElement('canvas');
      rotated.width = Math.max(1, Math.round(natural.w * fullScale));
      rotated.height = Math.max(1, Math.round(natural.h * fullScale));
      drawRotated(rotated.getContext('2d'), rotated.width, rotated.height, bitmap, angle);

      const cropScaleX = rotated.width / natural.w;
      const cropScaleY = rotated.height / natural.h;
      const sx = Math.max(0, Math.round(px.x * cropScaleX));
      const sy = Math.max(0, Math.round(px.y * cropScaleY));
      const sw = Math.max(1, Math.min(rotated.width - sx, Math.round(px.w * cropScaleX)));
      const sh = Math.max(1, Math.min(rotated.height - sy, Math.round(px.h * cropScaleY)));
      const out = document.createElement('canvas');
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);

      const type = sourceFile.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = type === 'image/png' ? undefined : .9;
      const blob = await new Promise(resolve => out.toBlob(resolve, type, quality));
      if (!blob) throw new Error('Could not create the edited image.');
      const ext = type === 'image/png' ? '.png' : '.jpg';
      const edited = new File([blob], `${safeBaseName(sourceFile.name)}-edited${ext}`, { type, lastModified: Date.now() });
      const transfer = new DataTransfer();
      transfer.items.add(edited);
      currentInput.files = transfer.files;
      currentInput.dispatchEvent(new Event('change', { bubbles: true }));
      dialog.close();
    } catch (err) {
      alert(err?.message || 'Could not apply this edit.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Apply edit';
    }
  }

  function closeEditor() { if (dialog?.open) dialog.close(); }
  function releaseBitmap() { if (bitmap?.close) bitmap.close(); bitmap = null; sourceFile = null; currentInput = null; dragging = false; }

  async function inspectFile(file) {
    if (!file) return null;
    const info = { size: file.size, type: formatType(file.type), width: 0, height: 0 };
    try {
      const b = await createImageBitmap(file);
      info.width = b.width; info.height = b.height; b.close?.();
    } catch (_) {}
    return info;
  }

  function installTarget(target) {
    const input = document.getElementById(target.input);
    const upload = document.getElementById(target.upload);
    if (!input || !upload) return;
    const row = input.closest('.upload-row');
    if (!row || row.nextElementSibling?.dataset?.imageToolsFor === target.input) return;
    const tools = document.createElement('div');
    tools.className = 'image-file-tools';
    tools.dataset.imageToolsFor = target.input;
    tools.innerHTML = `<div class="image-file-meta" role="status" aria-live="polite">Choose an image to see its dimensions and size.</div><button type="button" class="ghost-btn image-edit-btn" hidden>✎ Edit</button>`;
    row.insertAdjacentElement('afterend', tools);
    const meta = $('.image-file-meta', tools);
    const edit = $('.image-edit-btn', tools);

    async function refresh() {
      const file = input.files?.[0];
      if (!file) {
        meta.textContent = 'Choose an image to see its dimensions and size.';
        edit.hidden = true;
        return;
      }
      const token = file;
      meta.textContent = `${file.name} · reading image…`;
      const info = await inspectFile(file);
      if (input.files?.[0] !== token || !info) return;
      const dimensions = info.width && info.height ? `${info.width} × ${info.height} px` : 'dimensions unavailable';
      meta.innerHTML = `<strong>${dimensions}</strong> · ${formatBytes(info.size)} · ${info.type}`;
      edit.hidden = !/^image\/(jpeg|png|webp)$/.test(file.type);
    }
    input.addEventListener('change', refresh);
    edit.addEventListener('click', () => openEditor(input));
    refresh();
  }

  function init() { targets.forEach(installTarget); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
