/* Admin AI modules. Source files are bundled into code.gs by scripts/build.mjs. */

function aiAdminOptimizedImageUrl_(url) {
  const value = String(url || '').trim();
  if (!value || !/res\.cloudinary\.com/i.test(value) || !/\/upload\//.test(value)) return value;
  if (/\/upload\/f_auto,q_auto:eco,w_1280,c_limit\//.test(value)) return value;
  return value.replace('/upload/', '/upload/f_auto,q_auto:eco,w_1280,c_limit/');
}

function sanitizeAiAdminImageUrls_(urls) {
  if (!Array.isArray(urls)) return [];
  const seen = {};
  return urls.map(function(url) { return String(url || '').trim(); }).filter(function(url) {
    if (!/^https:\/\//i.test(url) || seen[url]) return false;
    seen[url] = true;
    return true;
  }).slice(0, 5);
}

function aiAdminRequestImages_(body, message, history) {
  const current = sanitizeAiAdminImageUrls_(body && body.imageUrls);
  if (current.length) return current;
  // Reuse photos only for an explicit reference or continuation of a draft.
  if (!/\b(this|these|that|those|same|attached|photo|picture|image|it)\b/i.test(message) && !(body && body.productDraft)) return [];
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === 'assistant' && /^Applied:/i.test(turn.text)) break;
    if (turn.role === 'user' && turn.images && turn.images.length) return turn.images;
  }
  return [];
}
