/* AI connection/model configuration. Secrets stay in Script Properties and are
 * never returned to the browser. Metadata and keys are stored separately. */
const AI_CONNECTIONS_PROPERTY = 'AI_CONNECTIONS_JSON_V1';
const AI_CONNECTION_KEY_PREFIX = 'AI_CONN_KEY_';
const AI_EFFORT_VALUES = ['none','minimal','low','medium','high','xhigh'];

function aiConnections_() {
  let value = [];
  try { value = JSON.parse(PropertiesService.getScriptProperties().getProperty(AI_CONNECTIONS_PROPERTY) || '[]'); }
  catch (_) { value = []; }
  return Array.isArray(value) ? value.map(aiNormalizeStoredConnection_).filter(Boolean) : [];
}

function aiNormalizeStoredConnection_(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!id) return null;
  const baseUrl = String(raw.baseUrl || '').trim().replace(/\/+$/, '');
  const apiType = aiNormalizeApiType_(raw.apiType || 'chat_completions');
  const models = Array.isArray(raw.models) ? raw.models.map(function(model) {
    if (!model || typeof model !== 'object') return null;
    const modelId = String(model.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const providerModel = String(model.model || '').trim().slice(0, 180);
    if (!modelId || !providerModel) return null;
    const efforts = Array.isArray(model.efforts) ? model.efforts.map(function(v) { return String(v || '').toLowerCase(); }).filter(function(v, i, arr) { return AI_EFFORT_VALUES.indexOf(v) !== -1 && arr.indexOf(v) === i; }) : [];
    const defaultEffort = efforts.indexOf(String(model.defaultEffort || '').toLowerCase()) !== -1 ? String(model.defaultEffort).toLowerCase() : (efforts[0] || '');
    return {
      id: modelId,
      label: String(model.label || providerModel).trim().slice(0, 100),
      model: providerModel,
      enabled: model.enabled !== false,
      efforts: efforts,
      defaultEffort: defaultEffort,
      vision: model.vision !== false
    };
  }).filter(Boolean) : [];
  return {
    id: id,
    name: String(raw.name || 'AI connection').trim().slice(0, 100),
    baseUrl: baseUrl,
    apiType: apiType,
    enabled: raw.enabled !== false,
    imageDetail: /^(low|high|auto)$/.test(String(raw.imageDetail || '').toLowerCase()) ? String(raw.imageDetail).toLowerCase() : 'low',
    maxOutputTokens: Math.max(700, Math.min(5000, Math.floor(Number(raw.maxOutputTokens) || 5000))),
    models: models
  };
}

function aiNormalizeApiType_(value) {
  let apiType = String(value || 'chat_completions').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (['chat','chat_completion','chatcompletion','chat_completions'].indexOf(apiType) !== -1) return 'chat_completions';
  if (['response','responses'].indexOf(apiType) !== -1) return 'responses';
  throw new Error('API type must be responses or chat_completions.');
}

function aiSafeConnections_() {
  const props = PropertiesService.getScriptProperties();
  return aiConnections_().map(function(connection) {
    return Object.assign({}, connection, {
      hasApiKey: !!String(props.getProperty(AI_CONNECTION_KEY_PREFIX + connection.id) || '').trim()
    });
  });
}

function aiPublicModels_() {
  const result = [];
  aiSafeConnections_().forEach(function(connection) {
    if (!connection.enabled || !connection.hasApiKey) return;
    connection.models.forEach(function(model) {
      if (!model.enabled) return;
      result.push({
        configId: connection.id + ':' + model.id,
        connectionId: connection.id,
        connectionName: connection.name,
        label: model.label,
        model: model.model,
        efforts: model.efforts,
        defaultEffort: model.defaultEffort,
        vision: model.vision
      });
    });
  });
  if (!result.length) {
    const legacyKey = String(secret_('AI_API_KEY', secret_('OPENAI_API_KEY', '')) || '').trim();
    const legacyModel = String(secret_('AI_MODEL', secret_('OPENAI_MODEL', '')) || '').trim();
    if (legacyKey && legacyModel) {
      result.push({ configId: 'legacy', connectionId: 'legacy', connectionName: 'Legacy Script Properties', label: legacyModel, model: legacyModel, efforts: ['low','medium','high'], defaultEffort: 'low', vision: true });
    }
  }
  return result;
}

function aiConfigGet_() {
  return { success: true, connections: aiSafeConnections_(), models: aiPublicModels_() };
}

function aiModelsGet_() {
  return { success: true, models: aiPublicModels_() };
}

function aiValidateConnectionInput_(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const existingId = String(raw.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const id = existingId || ('conn_' + Utilities.getUuid().replace(/-/g, '').slice(0, 18));
  const name = String(raw.name || '').trim().slice(0, 100);
  if (!name) throw new Error('Connection name is required.');
  const baseUrl = String(raw.baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('Base URL must start with https://');
  const apiType = aiNormalizeApiType_(raw.apiType || 'chat_completions');
  const sourceModels = Array.isArray(raw.models) ? raw.models : [];
  if (!sourceModels.length) throw new Error('Add at least one model.');
  if (sourceModels.length > 20) throw new Error('A connection can have at most 20 models.');
  const seen = {};
  const models = sourceModels.map(function(model, index) {
    model = model && typeof model === 'object' ? model : {};
    const providerModel = String(model.model || '').trim().slice(0, 180);
    if (!providerModel) throw new Error('Model ' + (index + 1) + ' needs a provider model ID.');
    let modelId = String(model.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!modelId) modelId = 'model_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
    if (seen[modelId]) throw new Error('Model IDs must be unique inside a connection.');
    seen[modelId] = true;
    const efforts = Array.isArray(model.efforts) ? model.efforts.map(function(v) { return String(v || '').toLowerCase(); }).filter(function(v, i, arr) { return AI_EFFORT_VALUES.indexOf(v) !== -1 && arr.indexOf(v) === i; }) : [];
    const defaultEffort = efforts.indexOf(String(model.defaultEffort || '').toLowerCase()) !== -1 ? String(model.defaultEffort).toLowerCase() : (efforts[0] || '');
    return {
      id: modelId,
      label: String(model.label || providerModel).trim().slice(0, 100),
      model: providerModel,
      enabled: model.enabled !== false,
      efforts: efforts,
      defaultEffort: defaultEffort,
      vision: model.vision !== false
    };
  });
  return {
    id: id,
    name: name,
    baseUrl: baseUrl,
    apiType: apiType,
    enabled: raw.enabled !== false,
    imageDetail: /^(low|high|auto)$/.test(String(raw.imageDetail || '').toLowerCase()) ? String(raw.imageDetail).toLowerCase() : 'low',
    maxOutputTokens: Math.max(700, Math.min(5000, Math.floor(Number(raw.maxOutputTokens) || 5000))),
    models: models
  };
}

function aiConfigSaveConnection_(body) {
  const input = body && body.connection;
  const connection = aiValidateConnectionInput_(input);
  const props = PropertiesService.getScriptProperties();
  const current = aiConnections_();
  const index = current.findIndex(function(x) { return x.id === connection.id; });
  const apiKey = String(body && body.apiKey || '').trim();
  if (index === -1 && !apiKey) throw new Error('API key is required for a new connection.');
  if (apiKey) props.setProperty(AI_CONNECTION_KEY_PREFIX + connection.id, apiKey);
  if (!String(props.getProperty(AI_CONNECTION_KEY_PREFIX + connection.id) || '').trim()) throw new Error('API key is missing for this connection.');
  if (index === -1) current.push(connection); else current[index] = connection;
  props.setProperty(AI_CONNECTIONS_PROPERTY, JSON.stringify(current));
  return aiConfigGet_();
}

function aiConfigDeleteConnection_(body) {
  const id = String(body && body.connectionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!id) throw new Error('Connection ID is required.');
  const props = PropertiesService.getScriptProperties();
  const next = aiConnections_().filter(function(x) { return x.id !== id; });
  props.setProperty(AI_CONNECTIONS_PROPERTY, JSON.stringify(next));
  props.deleteProperty(AI_CONNECTION_KEY_PREFIX + id);
  return aiConfigGet_();
}

function aiConfigTestConnection_(body) {
  const candidate = aiValidateConnectionInput_(body && body.connection);
  const props = PropertiesService.getScriptProperties();
  const suppliedKey = String(body && body.apiKey || '').trim();
  const apiKey = suppliedKey || String(props.getProperty(AI_CONNECTION_KEY_PREFIX + candidate.id) || '').trim();
  if (!apiKey) throw new Error('Enter an API key before testing.');
  const enabledModels = candidate.models.filter(function(model) { return model.enabled; });
  if (!enabledModels.length) throw new Error('Enable at least one model before testing.');
  const results = enabledModels.map(function(model) {
    const started = Date.now();
    try {
      const config = aiConfigForConnectionModel_(candidate, model, apiKey);
      let output = '';
      if (config.apiType === 'chat_completions') {
        const data = aiFetchJson_(config, { model: config.model, messages: [{ role: 'user', content: 'Reply exactly: DSB AI OK' }], max_tokens: 30 });
        output = extractChatCompletionText_(data);
      } else {
        const data = aiFetchJson_(config, { model: config.model, store: false, max_output_tokens: 30, input: 'Reply exactly: DSB AI OK' });
        output = extractOpenAiOutputText_(data);
      }
      return { modelId: model.id, label: model.label, model: model.model, ok: !!output, response: String(output || '').slice(0, 80), elapsedMs: Date.now() - started };
    } catch (err) {
      return { modelId: model.id, label: model.label, model: model.model, ok: false, error: String(err && err.message || err).slice(0, 300), elapsedMs: Date.now() - started };
    }
  });
  return { success: results.every(function(x) { return x.ok; }), results: results };
}

function aiConfigForConnectionModel_(connection, model, apiKey) {
  const baseUrl = connection.baseUrl;
  const apiType = connection.apiType;
  const endpoint = aiEndpoint_(baseUrl, apiType);
  const isGemini = aiIsGeminiBaseUrl_(baseUrl);
  return {
    apiKey: apiKey,
    baseUrl: baseUrl,
    endpoint: endpoint,
    model: model.model,
    apiType: apiType,
    providerLabel: connection.name || aiProviderLabel_(baseUrl),
    imageDetail: connection.imageDetail || 'low',
    maxOutputTokens: connection.maxOutputTokens || 5000,
    isGemini: isGemini,
    reasoningEffort: model.defaultEffort || '',
    modelConfigId: connection.id + ':' + model.id,
    modelLabel: model.label,
    supportedEfforts: model.efforts || [],
    vision: model.vision !== false
  };
}

function aiConfiguredProvider_(configId) {
  const parts = String(configId || '').split(':');
  if (parts.length !== 2) return null;
  const connections = aiConnections_();
  const connection = connections.find(function(x) { return x.id === parts[0] && x.enabled; });
  if (!connection) return null;
  const model = connection.models.find(function(x) { return x.id === parts[1] && x.enabled; });
  if (!model) return null;
  const key = String(PropertiesService.getScriptProperties().getProperty(AI_CONNECTION_KEY_PREFIX + connection.id) || '').trim();
  if (!key) throw new Error('The selected AI connection has no API key.');
  return aiConfigForConnectionModel_(connection, model, key);
}
