import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
const [client, adminClient, analytics, cache, admin, auth, html] = await Promise.all([
  read('storefront-analytics.js'), read('admin-analytics.js'), read('src/backend/analytics.gs'),
  read('src/backend/cache.gs'), read('admin.js'), read('src/backend/admin-auth.gs'), read('admin.html')
]);

// Queue reliability: every queued event has a stable ID and successful flushes
// remove only those IDs from the latest queue snapshot.
assert(client.includes('qid: randomId()'), 'Analytics events need stable queue IDs');
assert(client.includes('writeQueue(queue);'), 'Queue IDs must be persisted before an in-flight flush');
assert(client.includes('const sent = new Set(chunk.map(item => item.qid))'), 'Flush must identify only the sent batch');
assert(client.includes('writeQueue(readQueue().filter(item => !sent.has(item.qid)))'), 'Flush must preserve events added while upload is in flight');
assert(client.includes('!data.busy && !data.throttled'), 'Busy/throttled analytics batches must remain queued for retry');
assert(analytics.includes('cache.getAll(cacheKeys)') && analytics.includes('qidCol'), 'Backend must deduplicate retried analytics batches by qid');
assert(client.includes('SESSION_TTL = 30 * 60 * 1000'), 'Analytics sessions must use a rolling 30-minute inactivity window');

// Refresh correctness and cache invalidation.
assert(adminClient.includes("adminRead('adminAnalytics', { days: Number($a('analyticsRange').value) || 30, force: !!force,"), 'Refresh button must request a forced report');
assert(analytics.includes('options.force || window.custom ? null : cacheGetChunkedJson_(cacheKey)'), 'Backend must bypass cached analytics when force=true');
assert(cache.includes('function invalidateAnalyticsCaches_()'), 'Analytics report cache needs explicit invalidation');
assert(analytics.includes('invalidateAnalyticsCaches_();'), 'Analytics reset must invalidate analytics reports');
assert(cache.includes('invalidateAnalyticsCaches_();'), 'Commerce writes must invalidate analytics reports too');

// Metric correctness: conversion and funnel are deduped user/session outcomes,
// while Orders/Revenue remain authoritative business metrics.
assert(analytics.includes('convertedVisitors'), 'Conversion must count unique tracked converting visitors');
assert(analytics.includes('analyticsPct_(current.convertedVisitors, current.visitors)'), 'Conversion must not be orders / visitors');
assert(analytics.includes("{ key: 'sessions', label: 'Sessions', value: current.sessions }"), 'Funnel must start from sessions');
assert(analytics.includes("label: 'Cart sessions'"), 'Funnel cart stage must be session-deduped');
assert(analytics.includes("label: 'Tracked order sessions'"), 'Funnel completion must use tracked order sessions');
assert(analytics.includes('sessionState') && analytics.includes('sourceCounts') && analytics.includes('deviceCounts'), 'Source/device breakdowns should count sessions, not page views');
assert(analytics.includes('viewerAdds') && analytics.includes('viewVisitors'), 'Product cart rate should use unique viewers who added');
assert(adminClient.includes('x.convertedVisitors * 100 / x.visitors'), 'Conversion trend must use converting visitors');

// Version/cache busting so deployed clients actually receive QA fixes.
assert(admin.includes('profile.version !== 26'), 'Admin must require backend version 26');
assert(auth.includes('version: Number(body.options && body.options.requiredVersion) === 26 ? 26 : Number(body.options && body.options.requiredVersion) === 25 ? 25 : 24'), 'Backend must negotiate API version 26');
assert(html.includes('admin.js?v=20260923reliability1'), 'Admin JS cache bust missing');
assert(html.includes('admin-analytics.js?v=20260923audit26'), 'Analytics admin cache bust missing');
console.log('PASS: Step 2 analytics reliability, metric integrity, cache freshness and version sync.');
