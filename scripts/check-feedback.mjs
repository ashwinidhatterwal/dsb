import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const listeners = new Map(), timers = new Map(), animations = [];
let timerId = 0, mediaChange;
const toast = {textContent: '', classList: {add() {}, remove() { toast.hidden = true; }}};
const media = {matches: false, addEventListener(_, callback) {mediaChange = callback;}};
const context = vm.createContext({
  window: {matchMedia: () => media},
  document: {getElementById: () => toast, addEventListener: (type, callback) => listeners.set(type, callback)},
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
const click = () => listeners.get('click')({target: {closest: () => control}});
click(); assert.equal(animations.length, 0, 'Disabled controls must not animate');
setButtonBusy(control, false); assert.equal(attributes.has('aria-busy'), false);
click(); click(); assert.equal(animations.length, 2); assert(animations[0].cancelled);
media.matches = true; mediaChange(); assert(animations[1].cancelled);
click(); assert.equal(animations.length, 2, 'Reduced motion must bypass JS animation');
for (const name of await fs.readdir(root)) {
  if (!name.endsWith('.html')) continue;
  const html = await fs.readFile(new URL(name, root), 'utf8');
  assert.equal((html.match(/src="ui-feedback.js/g) || []).length, 1, name);
  assert.equal((html.match(/href="ui-feedback.css/g) || []).length, 1, name);
}
assert(!(await fs.readFile(new URL('admin-theme.css', root), 'utf8')).includes('\\n'), 'CSS must not contain escaped line separators');
console.log('PASS: toast replacement, busy state, rapid clicks, disabled buttons, live reduced-motion changes and shared assets on every page.');
