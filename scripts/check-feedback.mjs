import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const listeners = new Map(), timers = new Map(), animations = [];
let timerId = 0;
const mediaChanges = [], effects = [];
const toast = {textContent: '', classList: {add() {}, remove() { toast.hidden = true; }}};
const media = {matches: false, addEventListener(_, callback) {mediaChanges.push(callback);}};
const context = vm.createContext({
  window: {matchMedia: () => media},
  document: {
    getElementById: id => id === 'toast' ? toast : null,
    addEventListener: (type, callback) => listeners.set(type, callback),
    createElement: () => ({style: {}, setAttribute() {}, remove() {this.removed = true;}}),
    body: {appendChild: node => effects.push(node)}
  },
  innerWidth: 390, innerHeight: 844,
  MutationObserver: class {observe() {}},
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
  clearTimeout: id => timers.delete(id),
  requestAnimationFrame: () => {}
});
vm.runInContext(await fs.readFile(new URL('ui-feedback.js', root), 'utf8'), context);
const {showToast, setButtonBusy} = context.window;
showToast('First'); showToast('Second');
assert.equal(toast.textContent, 'Second');
assert.equal(timers.size, 1, 'A previous toast must not dismiss the new message');
[...timers.values()][0](); assert.equal(toast.hidden, true);
const attributes = new Map();
const control = {
  disabled: false,
  setAttribute: (key, value) => attributes.set(key, value),
  removeAttribute: key => attributes.delete(key),
  matches: () => control.disabled,
  closest: () => null,
  animate: () => { const a = {cancel() {a.cancelled = true; a.oncancel?.();}}; animations.push(a); return a; }
};
setButtonBusy(control, true);
assert.equal(control.disabled, true); assert.equal(attributes.get('aria-busy'), 'true');
assert.equal(listeners.has('click'), false, 'CSS alone owns pressing: do not restart scale on release');
setButtonBusy(control, false); assert.equal(attributes.has('aria-busy'), false);
const invalid = () => listeners.get('invalid')({target: control});
invalid(); invalid(); assert.equal(animations.length, 2); assert(animations[0].cancelled);
const anchor = {getBoundingClientRect: () => ({width: 44, top: 300, bottom: 344, right: 360})};
context.window.DSBFeedback.celebrate(anchor);
context.window.DSBFeedback.celebrate(anchor);
assert.equal(effects.length, 2); assert.equal(effects[0].removed, true, 'Rapid additions keep only one burst');
media.matches = true; mediaChanges.forEach(fn => fn()); assert(animations[1].cancelled);
assert.equal(effects[1].removed, true);
context.window.DSBFeedback.celebrate(anchor);
invalid(); assert.equal(animations.length, 2); assert.equal(effects.length, 2);
assert(!(await fs.readFile(new URL('ui-feedback.js', root), 'utf8')).includes('MutationObserver'), 'Content changes must not animate page regions');
assert(!(await fs.readFile(new URL('cart-ui-core.js', root), 'utf8')).includes('flyToCart'), 'Obsolete flying animation must stay removed');
for (const name of await fs.readdir(root)) {
  if (!name.endsWith('.html')) continue;
  const html = await fs.readFile(new URL(name, root), 'utf8');
  assert.equal((html.match(/src="ui-feedback.js/g) || []).length, 1, name);
  assert.equal((html.match(/href="ui-feedback.css/g) || []).length, 1, name);
}
assert(!(await fs.readFile(new URL('admin-theme.css', root), 'utf8')).includes('\\n'), 'CSS must not contain escaped line separators');
console.log('PASS: toast replacement, busy state, single press ownership, rapid cart bursts, live reduced-motion changes and shared assets on every page.');
