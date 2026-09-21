/* cache responsibilities. Bundled into code.gs by scripts/build.mjs. */
function cacheGetJson_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function cachePutJson_(key, value, ttl) {
  try {
    cacheRemove_(key);
    const raw = JSON.stringify(value),
      cache = CacheService.getScriptCache();
    // UTF-16 length bounds UTF-8 size by 3 bytes per code unit.
    // Keep Hindi text and emoji chunks comfortably within the cache limit.
    const MAX = 24000;
    if (raw.length <= MAX) {
      cache.put(key, raw, ttl);
      return;
    }
    const count = Math.ceil(raw.length / MAX);
    if (count > 900) return;
    const values = {};
    for (let i = 0; i < count; i++) values[key + ':' + i] = raw.slice(i * MAX, (i + 1) * MAX);
    cache.putAll(values, ttl);
    cache.put(key + ':meta', String(count), ttl);
  } catch (_) {/* Caching is optional; live catalogue and order writes still work. */}
}
function cacheGetChunkedJson_(key) {
  try {
    const cache = CacheService.getScriptCache(),
      meta = cache.get(key + ':meta');
    if (!meta) return cacheGetJson_(key);
    const count = Number(meta);
    if (!Number.isInteger(count) || count < 1 || count > 900) return null;
    const keys = Array.from({
        length: count
      }, (_, i) => key + ':' + i),
      parts = cache.getAll(keys);
    if (keys.some(k => typeof parts[k] !== 'string')) return null;
    return JSON.parse(keys.map(k => parts[k]).join(''));
  } catch (_) {
    return null;
  }
}
function cacheRemove_(key) {
  try {
    const cache = CacheService.getScriptCache(),
      count = Number(cache.get(key + ':meta')) || 0;
    const keys = [key, key + ':meta'];
    if (Number.isInteger(count) && count > 0 && count <= 900) for (let i = 0; i < count; i++) keys.push(key + ':' + i);
    cache.removeAll(keys);
  } catch (_) {/* Checkout always validates inventory directly from the sheet. */}
}
function invalidateAnalyticsCaches_() {
  [7, 30, 90].forEach(days => cacheRemove_(ANALYTICS_REPORT_CACHE_KEY + ':' + days));
}
function invalidatePublicCaches_() {
  cacheRemove_(CATALOG_CACHE_KEY);
  cacheRemove_(REVIEWS_CACHE_KEY);
  cacheRemove_(REVIEW_SUMMARY_CACHE_KEY);
  cacheRemove_(PROMOS_CACHE_KEY);
  cacheRemove_(DASHBOARD_CACHE_KEY);
  invalidateAnalyticsCaches_();
}
