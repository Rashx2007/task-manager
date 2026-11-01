import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { columnMenuPlacement, trackColumnMenu } from '../lib/column-menu-position.mjs';
function visible(result, panel, width, height) {
  assert.ok(result.left >= 0 && result.top >= 0);
  assert.ok(result.left + Math.min(panel.width, result.maxWidth) <= width);
  assert.ok(result.top + Math.min(panel.height, result.maxHeight) <= height);
}
const cases = [
  ['left edge like reported screenshot', { top: 35, bottom: 65, right: 32 }, { width: 300, height: 470 }, 390, 844],
  ['right edge', { top: 35, bottom: 65, right: 1918 }, { width: 300, height: 470 }, 1920, 1080],
  ['bottom edge', { top: 700, bottom: 730, right: 500 }, { width: 300, height: 470 }, 1000, 750],
  ['short screen', { top: 30, bottom: 60, right: 150 }, { width: 300, height: 600 }, 390, 320],
  ['narrow screen', { top: 20, bottom: 50, right: 210 }, { width: 300, height: 400 }, 220, 500],
  ['anchor scrolled beyond left edge', { top: 30, bottom: 60, right: -50 }, { width: 300, height: 400 }, 800, 600],
  ['anchor scrolled beyond bottom', { top: 900, bottom: 930, right: 900 }, { width: 300, height: 400 }, 800, 600],
];
for (const [name, anchor, panel, width, height] of cases) test(name, () => visible(columnMenuPlacement(anchor, panel, width, height), panel, width, height));
test('Menu opens below with space and above when only above fits', () => {
  assert.equal(columnMenuPlacement({ top: 100, bottom: 130, right: 500 }, { width: 300, height: 200 }, 1000, 800).top, 132);
  assert.equal(columnMenuPlacement({ top: 700, bottom: 730, right: 500 }, { width: 300, height: 200 }, 1000, 800).top, 498);
});
test('Tracking responds to scroll, resize and async content height, and cleans up', () => {
  const listeners = new Map(); let observed, disconnected = false, resizeCallback;
  const view = { innerWidth: 1000, innerHeight: 750,
    addEventListener: (key, callback) => listeners.set(key, callback),
    removeEventListener: (key, callback) => { assert.equal(listeners.get(key), callback); listeners.delete(key); },
    ResizeObserver: class { constructor(callback) { resizeCallback = callback; } observe(node) { observed = node; } disconnect() { disconnected = true; } },
  };
  let right = 20, height = 300;
  const anchor = { getBoundingClientRect: () => ({ top: 150, bottom: 180, right }) };
  const panel = { style: {}, getBoundingClientRect() { return { width: Math.min(300, parseFloat(this.style.maxWidth)), height: Math.min(height, parseFloat(this.style.maxHeight)) }; } };
  const cleanup = trackColumnMenu(panel, anchor, view);
  assert.equal(panel.style.left, '8px'); assert.equal(observed, panel); assert.equal(panel.style.right, 'auto');
  right = 900; listeners.get('scroll')(); assert.equal(panel.style.left, '600px');
  view.innerWidth = 250; view.innerHeight = 400; listeners.get('resize')();
  assert.equal(panel.style.maxWidth, '234px'); assert.equal(panel.style.maxHeight, '384px');
  assert.equal(panel.style.left, '8px');
  height = 800; resizeCallback(); assert.equal(panel.style.top, '8px');
  assert.equal(panel.style.overflowY, 'auto'); assert.equal(panel.style.boxSizing, 'border-box');
  cleanup(); assert.equal(listeners.size, 0); assert.ok(disconnected);
});
test('ResizeObserver is optional and absent refs are safe', () => {
  assert.doesNotThrow(() => trackColumnMenu(null, null, {})());
  const view = { innerWidth: 400, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
  const panel = { style: {}, getBoundingClientRect: () => ({ width: 300, height: 400 }) };
  assert.doesNotThrow(() => trackColumnMenu(panel, { getBoundingClientRect: () => ({ right: 100, top: 30, bottom: 60 }) }, view)());
});
test('Table keeps portal, wrapped text, autofocus and filters; removes guessed height', async () => {
  const source = (await fs.readFile(new URL('../components/TaskTable.jsx', import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
  assert.ok(source.includes('createPortal(')); assert.ok(source.includes('ref={menuPanelRef}'));
  assert.ok(source.includes('menuAnchorRef.current = e.currentTarget'));
  assert.ok(source.includes('trackColumnMenu(menuPanelRef.current, menuAnchorRef.current, window)'));
  assert.ok(!source.includes('window.innerHeight - 480')); assert.ok(!source.includes('right: menu.right'));
  assert.ok(source.includes('menuSearchRef.current?.focus({ preventScroll: true })'));
  assert.ok(source.includes('onChange={() => toggleFilterValue(menuCol.key, v)}'));
  assert.ok(source.includes('overflowWrap: "anywhere"'));
});
