// Component controller runs with fake hooks; source assertions cover JSX wiring.
// No browser, live SQL Server or completion operation is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const read = async (path) => {
  const text = await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  return text.replace(/\r\n?/g, '\n');
};
const picker = await read('components/AssetAutocomplete.jsx');
const form = await read('components/TaskForm.jsx');
const table = await read('components/TaskTable.jsx');
const inspector = await read('components/TaskInspectionTable.jsx');
const ruleSource = await read('lib/assetRules.js');
const ruleContext = vm.createContext({});
const ruleModule = new vm.SourceTextModule(ruleSource, { context: ruleContext });
await ruleModule.link(() => { throw Error('Unexpected import'); }); await ruleModule.evaluate();
const { normalizeDigits, normalizeFa } = ruleModule.namespace;
const assets = [{ AssetID: 1, label: 'پمپ بلوک الف طبقه ۰.۰ ورودی ۱' }, { AssetID: 2, label: 'چیلر بلوک ب طبقه -۳.۰' }];
function controller(items = assets, value = '') {
  const slots = [], refs = [], effects = [], listeners = new Map(), calls = [];
  let index = 0, refIndex = 0;
  const props = { assets: items, value, formatAsset: (asset) => asset.label,
    onChange: (text) => { props.value = text; calls.push(['text', text]); },
    onSelect: (asset) => calls.push(['select', asset.AssetID]) };
  const context = vm.createContext({ normalizeDigits, normalizeFa,
    document: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) },
    useId: () => 'picker-test', useState: (initial) => {
      const slot = index++; if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (next) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
    }, useRef: (initial) => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect: (effect) => effects.push(effect),
  });
  const prefix = picker.slice(0, picker.indexOf('\n  return (')).replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  vm.runInContext(prefix + '\n return { shown, open, activeIndex, choose, handleKeyDown, setOpen };\n}\nthis.render = AssetAutocomplete;', context);
  const render = () => { index = 0; refIndex = 0; effects.length = 0; return context.render(props); };
  return { render, calls, effects, refs, listeners, props };
}
function key(handler, name, extras = {}) {
  const event = { key: name, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extras };
  handler(event); return event;
}
test('Typing filters using actual Persian/Arabic digit normalization', () => {
  const h = controller(assets, 'طبقه 0.0'); assert.equal(h.render().shown.length, 1); assert.equal(h.render().shown[0].AssetID, 1);
  h.props.value = 'ورودي ١'; assert.equal(h.render().shown[0].AssetID, 1);
});
test('Selected full label shows all alternatives but never changes ownership merely on opening', () => {
  const h = controller(assets, assets[0].label); const state = h.render();
  assert.equal(state.shown.length, 2); state.setOpen(true); h.render(); assert.equal(h.calls.length, 0);
});
test('Arrow navigation then Enter selects the exact device and cannot submit the task', () => {
  const h = controller(); let state = h.render();
  const arrow = key(state.handleKeyDown, 'ArrowDown'); assert.ok(arrow.prevented && arrow.stopped);
  state = h.render(); assert.equal(state.activeIndex, 0);
  key(state.handleKeyDown, 'ArrowDown'); state = h.render(); assert.equal(state.activeIndex, 1);
  const enter = key(state.handleKeyDown, 'Enter'); assert.ok(enter.prevented && enter.stopped);
  assert.deepEqual(h.calls, [['select', 2], ['text', assets[1].label]]); assert.equal(h.render().open, false);
});
test('Enter without a highlighted result does not save or select a random device', () => {
  const h = controller(); h.render().setOpen(true);
  const event = key(h.render().handleKeyDown, 'Enter'); assert.ok(event.prevented && event.stopped); assert.equal(h.calls.length, 0);
});
test('Escape closes child list first; subsequent Escape is free to reach the parent', () => {
  const h = controller(); h.render().setOpen(true);
  assert.equal(key(h.render().handleKeyDown, 'Escape').stopped, true);
  assert.equal(h.render().open, false);
  assert.equal(key(h.render().handleKeyDown, 'Escape').stopped, false); assert.equal(h.calls.length, 0);
});
test('IME composition cannot confirm a device or swallow Escape', () => {
  const h = controller(); h.render().setOpen(true);
  const event = key(h.render().handleKeyDown, 'Enter', { nativeEvent: { isComposing: true } });
  assert.equal(event.prevented, false); assert.equal(h.calls.length, 0);
});
test('No-match navigation and Enter never select or change the task', () => {
  const h = controller([], 'unknown'); key(h.render().handleKeyDown, 'ArrowDown');
  const state = h.render(); assert.equal(state.activeIndex, -1);
  key(state.handleKeyDown, 'Enter'); assert.equal(h.calls.length, 0);
});
test('Pointer outside only closes the list and never selects a device', () => {
  const h = controller(); h.render().setOpen(true); h.render();
  const inside = {}; h.refs[0].current = { contains: (node) => node === inside };
  const cleanup = h.effects[0](); h.listeners.get('pointerdown')({ target: inside }); assert.equal(h.render().open, true);
  h.listeners.get('pointerdown')({ target: {} }); assert.equal(h.render().open, false); assert.equal(h.calls.length, 0);
  cleanup(); assert.equal(h.listeners.size, 0);
});
test('Native datalist is replaced only for assets and full text remains visible below the input', () => {
  assert.ok(form.includes('<AssetAutocomplete')); assert.ok(!form.includes('list="assets-list"'));
  assert.ok(form.includes('<datalist id="subject-sugs">')); assert.ok(picker.includes('aria-label="متن کامل دستگاه"'));
  assert.ok(picker.includes('whiteSpace: "pre-wrap"')); assert.ok(picker.includes('overflowWrap: "anywhere"'));
  assert.ok(picker.includes('role="combobox"')); assert.ok(picker.includes('role="listbox"')); assert.ok(picker.includes('role="option"'));
});
test('Main and inspector filters wrap complete values and retain checkbox interactions', () => {
  assert.ok(!table.includes('<span className="truncate">{v}</span>'));
  assert.ok(table.includes('<span title={String(v)} style={{ minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere"'));
  assert.ok(table.includes('onChange={() => toggleFilterValue(menuCol.key, v)}'));
  assert.ok(table.includes('onDraftAssign(menuCol.key, v)'));
  assert.ok(inspector.includes("<span title={value} style={{ minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'"));
  assert.ok(inspector.includes('picked.has(value)')); assert.ok(inspector.includes('inputRef.current?.focus()'));
});
test('Popover opening does not invoke API writes; keyboard action cannot accidentally select on blur', () => {
  assert.ok(!picker.includes('fetch(')); assert.ok(!picker.includes('dangerouslySetInnerHTML'));
  assert.ok(picker.includes('onMouseDown={(event) => event.preventDefault()}'));
  assert.ok(picker.includes('onClick={() => choose(asset)}'));
});
