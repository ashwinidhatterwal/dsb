(() => {
  'use strict';
  const state = { connections: [], models: [], editingId: '', loaded: false };
  const $c = (s, c = document) => c.querySelector(s);
  const $$c = (s, c = document) => Array.from(c.querySelectorAll(s));
  const effortLabels = { none:'None', minimal:'Minimal', low:'Low', medium:'Medium', high:'High', xhigh:'Extra high' };

  function safe(value) { return escapeHtml(String(value ?? '')); }
  function currentModel(configId) { return state.models.find(m => m.configId === configId); }

  function populateModelSelect(select, storageKey) {
    if (!select) return;
    const previous = localStorage.getItem(storageKey) || select.value;
    if (!state.models.length) {
      select.innerHTML = '<option value="">No configured models</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = state.models.map(m => `<option value="${safe(m.configId)}">${safe(m.label)} · ${safe(m.connectionName)}</option>`).join('');
    select.value = state.models.some(m => m.configId === previous) ? previous : state.models[0].configId;
    localStorage.setItem(storageKey, select.value);
  }

  function populateEffortSelect(modelSelect, effortSelect, storageKey) {
    if (!modelSelect || !effortSelect) return;
    const model = currentModel(modelSelect.value);
    const efforts = model?.efforts || [];
    const previous = localStorage.getItem(storageKey) || effortSelect.value || model?.defaultEffort || '';
    if (!efforts.length) {
      effortSelect.innerHTML = '<option value="">Not supported</option>';
      effortSelect.value = '';
      effortSelect.disabled = true;
      return;
    }
    effortSelect.disabled = false;
    effortSelect.innerHTML = efforts.map(v => `<option value="${safe(v)}">${safe(effortLabels[v] || v)}</option>`).join('');
    effortSelect.value = efforts.includes(previous) ? previous : (efforts.includes(model.defaultEffort) ? model.defaultEffort : efforts[0]);
    localStorage.setItem(storageKey, effortSelect.value);
  }

  function refreshSelectors() {
    const pairs = [
      ['#adminAiModel', '#adminAiQuality', 'dsb.ai.admin.model', 'dsb.ai.admin.effort'],
      ['#aiFillModel', '#aiFillEffort', 'dsb.ai.product.model', 'dsb.ai.product.effort']
    ];
    pairs.forEach(([modelSel, effortSel, modelKey, effortKey]) => {
      const m = $c(modelSel), e = $c(effortSel);
      populateModelSelect(m, modelKey);
      populateEffortSelect(m, e, effortKey);
      if (m && !m.dataset.aiConfigBound) {
        m.dataset.aiConfigBound = '1';
        m.addEventListener('change', () => {
          localStorage.setItem(modelKey, m.value);
          populateEffortSelect(m, e, effortKey);
        });
      }
      if (e && !e.dataset.aiConfigBound) {
        e.dataset.aiConfigBound = '1';
        e.addEventListener('change', () => localStorage.setItem(effortKey, e.value));
      }
    });
  }

  async function loadModels() {
    if (!API_URL || !ADMIN_KEY || !ADMIN_PROFILE) return [];
    const data = await adminRead('aiModels');
    state.models = Array.isArray(data?.models) ? data.models : [];
    refreshSelectors();
    return state.models;
  }

  function modelRow(model = {}) {
    const id = model.id || '';
    const efforts = Array.isArray(model.efforts) ? model.efforts : ['low','medium','high'];
    const defaults = model.defaultEffort || efforts[0] || '';
    return `<div class="ai-config-model" data-model-id="${safe(id)}">
      <div class="ai-config-model-head"><strong>Model</strong><button type="button" class="ghost-btn ai-model-remove">Remove</button></div>
      <div class="ai-config-grid two">
        <label><span>Display name</span><input class="ai-model-label" maxlength="100" value="${safe(model.label || '')}" placeholder="e.g. Smart model"></label>
        <label><span>Provider model ID</span><input class="ai-model-id" maxlength="180" value="${safe(model.model || '')}" placeholder="e.g. gpt-5.6-luna"></label>
      </div>
      <div class="ai-config-model-options">
        <label><input type="checkbox" class="ai-model-enabled" ${model.enabled === false ? '' : 'checked'}> Enabled</label>
        <label><input type="checkbox" class="ai-model-vision" ${model.vision === false ? '' : 'checked'}> Vision/images</label>
      </div>
      <div class="ai-config-efforts"><span>Effort levels shown in AI dropdown</span><div class="ai-effort-checks">
        ${['none','minimal','low','medium','high','xhigh'].map(v => `<label><input type="checkbox" data-effort="${v}" ${efforts.includes(v) ? 'checked' : ''}> ${effortLabels[v]}</label>`).join('')}
      </div></div>
      <label class="ai-config-default-effort"><span>Default effort</span><select class="ai-model-default-effort">${efforts.length ? efforts.map(v => `<option value="${v}" ${v === defaults ? 'selected' : ''}>${effortLabels[v]}</option>`).join('') : '<option value="">None</option>'}</select></label>
    </div>`;
  }

  function bindModelRow(row) {
    $c('.ai-model-remove', row)?.addEventListener('click', () => row.remove());
    $$c('[data-effort]', row).forEach(box => box.addEventListener('change', () => syncDefaultEffort(row)));
  }
  function syncDefaultEffort(row) {
    const selected = $$c('[data-effort]:checked', row).map(x => x.dataset.effort);
    const select = $c('.ai-model-default-effort', row);
    const previous = select.value;
    select.innerHTML = selected.length ? selected.map(v => `<option value="${v}">${effortLabels[v]}</option>`).join('') : '<option value="">None</option>';
    if (selected.includes(previous)) select.value = previous;
  }

  function renderConnections() {
    const root = $c('#aiConfigList');
    if (!root) return;
    if (!state.connections.length) {
      root.innerHTML = '<div class="ai-config-empty"><strong>No AI connections yet</strong><p>Add an API key, base URL and one or more models. Existing Script Properties remain usable until you add a connection.</p></div>';
      return;
    }
    root.innerHTML = state.connections.map(c => `<article class="ai-config-card" data-id="${safe(c.id)}">
      <div><div class="ai-config-card-title"><strong>${safe(c.name)}</strong><span class="${c.enabled ? 'ok' : 'off'}">${c.enabled ? 'Enabled' : 'Disabled'}</span></div><small>${safe(c.baseUrl)}</small></div>
      <div class="ai-config-card-models">${c.models.map(m => `<span class="${m.enabled ? '' : 'disabled'}">${safe(m.label || m.model)}</span>`).join('')}</div>
      <div class="ai-config-card-actions"><span class="ai-key-state">${c.hasApiKey ? '🔒 Key saved' : '⚠ Key missing'}</span><button type="button" class="ghost-btn" data-edit>Edit</button><button type="button" class="ghost-btn danger" data-delete>Delete</button></div>
    </article>`).join('');
    $$c('[data-edit]', root).forEach(btn => btn.addEventListener('click', () => editConnection(btn.closest('[data-id]').dataset.id)));
    $$c('[data-delete]', root).forEach(btn => btn.addEventListener('click', () => deleteConnection(btn.closest('[data-id]').dataset.id)));
  }

  function editConnection(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection) return;
    state.editingId = id;
    showEditor(connection);
  }

  function showEditor(connection = null) {
    const editor = $c('#aiConfigEditor');
    if (!editor) return;
    state.editingId = connection?.id || '';
    editor.hidden = false;
    $c('#aiConnTitle').textContent = connection ? 'Edit AI connection' : 'Add AI connection';
    $c('#aiConnName').value = connection?.name || '';
    $c('#aiConnBaseUrl').value = connection?.baseUrl || '';
    $c('#aiConnApiType').value = connection?.apiType || 'chat_completions';
    $c('#aiConnApiKey').value = '';
    $c('#aiConnApiKey').placeholder = connection?.hasApiKey ? 'Saved — leave blank to keep current key' : 'Paste API key';
    $c('#aiConnEnabled').checked = connection?.enabled !== false;
    $c('#aiConnImageDetail').value = connection?.imageDetail || 'low';
    $c('#aiConnMaxTokens').value = connection?.maxOutputTokens || 5000;
    const models = $c('#aiConfigModels');
    models.innerHTML = (connection?.models?.length ? connection.models : [{}]).map(modelRow).join('');
    $$c('.ai-config-model', models).forEach(bindModelRow);
    $c('#aiConfigTestResult').innerHTML = '';
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collectConnection() {
    const rows = $$c('.ai-config-model', $c('#aiConfigModels'));
    return {
      id: state.editingId || '',
      name: $c('#aiConnName').value.trim(),
      baseUrl: $c('#aiConnBaseUrl').value.trim(),
      apiType: $c('#aiConnApiType').value,
      enabled: $c('#aiConnEnabled').checked,
      imageDetail: $c('#aiConnImageDetail').value,
      maxOutputTokens: Number($c('#aiConnMaxTokens').value) || 5000,
      models: rows.map(row => {
        const efforts = $$c('[data-effort]:checked', row).map(x => x.dataset.effort);
        return {
          id: row.dataset.modelId || '',
          label: $c('.ai-model-label', row).value.trim(),
          model: $c('.ai-model-id', row).value.trim(),
          enabled: $c('.ai-model-enabled', row).checked,
          vision: $c('.ai-model-vision', row).checked,
          efforts,
          defaultEffort: $c('.ai-model-default-effort', row).value || ''
        };
      })
    };
  }

  async function api(action, extra = {}, timeoutMs = 30000) {
    const res = await adminFetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({ key:ADMIN_KEY, action, ...extra }), timeoutMs });
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function loadPage() {
    if (!API_URL || !ADMIN_KEY || !ADMIN_PROFILE) return;
    const root = $c('#aiConfigList');
    if (ADMIN_PROFILE.role !== 'admin') {
      if (root) root.innerHTML = '<div class="ai-config-empty"><strong>Owner access required</strong><p>API keys and provider settings are available only to the admin owner role.</p></div>';
      $c('#aiConfigAdd').hidden = true;
      return;
    }
    $c('#aiConfigAdd').hidden = false;
    if (root) root.innerHTML = '<p class="hint">Loading AI connections…</p>';
    try {
      const data = await api('aiConfigGet');
      state.connections = Array.isArray(data.connections) ? data.connections : [];
      state.models = Array.isArray(data.models) ? data.models : [];
      state.loaded = true;
      renderConnections();
      refreshSelectors();
    } catch (err) {
      if (root) root.innerHTML = `<div class="ai-config-empty bad"><strong>Could not load AI configuration</strong><p>${safe(err.message)}</p></div>`;
    }
  }

  async function saveConnection() {
    const button = $c('#aiConfigSave');
    const connection = collectConnection();
    button.disabled = true; button.textContent = 'Saving…';
    try {
      const data = await api('aiConfigSaveConnection', { connection, apiKey:$c('#aiConnApiKey').value.trim() });
      state.connections = data.connections || [];
      state.models = data.models || [];
      renderConnections(); refreshSelectors();
      $c('#aiConfigEditor').hidden = true;
      showToast('AI connection saved');
    } catch (err) { showToast(err.message); }
    finally { button.disabled = false; button.textContent = 'Save connection'; }
  }

  async function testConnection() {
    const button = $c('#aiConfigTest');
    const result = $c('#aiConfigTestResult');
    button.disabled = true; button.textContent = 'Testing…';
    result.innerHTML = '<span class="hint">Checking configured models…</span>';
    try {
      const data = await api('aiConfigTestConnection', { connection:collectConnection(), apiKey:$c('#aiConnApiKey').value.trim() }, 120000);
      result.innerHTML = (data.results || []).map(x => `<div class="ai-test-row ${x.ok ? 'ok' : 'bad'}"><strong>${safe(x.label)}</strong><span>${x.ok ? `✓ Connected · ${(x.elapsedMs / 1000).toFixed(1)}s` : `✕ ${safe(x.error || 'Failed')}`}</span></div>`).join('');
    } catch (err) { result.innerHTML = `<div class="ai-test-row bad"><strong>Test failed</strong><span>${safe(err.message)}</span></div>`; }
    finally { button.disabled = false; button.textContent = 'Test connection'; }
  }

  async function deleteConnection(id) {
    const connection = state.connections.find(c => c.id === id);
    if (!connection || !confirm(`Delete ${connection.name} and its saved API key?`)) return;
    try {
      const data = await api('aiConfigDeleteConnection', { connectionId:id });
      state.connections = data.connections || [];
      state.models = data.models || [];
      renderConnections(); refreshSelectors();
      showToast('AI connection deleted');
    } catch (err) { showToast(err.message); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $c('#aiConfigAdd')?.addEventListener('click', () => showEditor());
    $c('#aiConfigCancel')?.addEventListener('click', () => { $c('#aiConfigEditor').hidden = true; });
    $c('#aiConfigSave')?.addEventListener('click', saveConnection);
    $c('#aiConfigTest')?.addEventListener('click', testConnection);
    $c('#aiConfigAddModel')?.addEventListener('click', () => {
      const root = $c('#aiConfigModels');
      root.insertAdjacentHTML('beforeend', modelRow({ efforts:['low','medium','high'], defaultEffort:'medium' }));
      bindModelRow(root.lastElementChild);
    });
  });

  window.DSBAIConfig = { loadPage, loadModels, refreshSelectors, state };
})();
