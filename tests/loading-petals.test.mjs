import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { visibleLoadingCenter, trackLoadingCenter } from '../lib/loading-center.mjs';
const box = (left, width, overflowX = 'visible', parentElement = null) => ({
  parentElement, overflowX, offsetWidth: width, clientWidth: width, clientLeft: 0,
  getBoundingClientRect: () => ({ left, width, right: left + width }),
});
const view = (width) => ({ innerWidth: width, getComputedStyle: (element) => ({ overflowX: element.overflowX }) });
for (const direction of ['ltr', 'rtl']) test(`Wide ${direction} table: midpoint is the visible region, before and after scroll`, () => {
  const clip = box(15, 1400, 'auto'); const element = box(-185, 1800, 'visible', clip);
  assert.equal(visibleLoadingCenter(element, view(1440)), 900);
  element.getBoundingClientRect = () => ({ left: 15, width: 1800, right: 1815 });
  assert.equal(visibleLoadingCenter(element, view(1440)), 700);
});
test('Normal full-width panel is centered without clipping', () => {
  assert.equal(visibleLoadingCenter(box(100, 600), view(1000)), 300);
});
test('Narrow mobile screen centers in visible table width', () => {
  const clip = box(8, 374, 'auto'); const element = box(-792, 1600, 'visible', clip);
  assert.equal(visibleLoadingCenter(element, view(390)), 987);
});
test('Nested clips and viewport intersection are respected', () => {
  const outer = box(20, 500, 'hidden'); const inner = box(100, 600, 'auto', outer);
  assert.equal(visibleLoadingCenter(box(-100, 1000, 'visible', inner), view(800)), 410);
});
test('Borders and transformed scale retain correct local coordinates', () => {
  const clip = box(20, 400, 'auto'); clip.clientLeft = 2; clip.clientWidth = 396;
  assert.equal(visibleLoadingCenter(box(0, 800, 'visible', clip), view(1000)), 220);
  const element = box(0, 800, 'visible', clip); element.offsetWidth = 400;
  assert.equal(visibleLoadingCenter(element, view(1000)), 110);
});
test('Pinch-zoom visual viewport is used when available', () => {
  const v = view(1000); v.visualViewport = { offsetLeft: 100, width: 400 };
  assert.equal(visibleLoadingCenter(box(0, 1000), v), 300);
});
test('Hidden or fully clipped loader does not place a visible graphic outside its section', () => {
  assert.equal(visibleLoadingCenter(box(0, 0), view(800)), null);
  assert.equal(visibleLoadingCenter(box(900, 100), view(800)), null);
});
test('Tracking updates on scrolling/resizing, observes ancestors and removes listeners', () => {
  const v = view(1000), events = new Map(), viewportEvents = new Map(), observed = [];
  let resizeObserver, disconnected = false;
  v.addEventListener = (key, fn) => events.set(key, fn); v.removeEventListener = (key) => events.delete(key);
  v.visualViewport = { offsetLeft: 0, width: 1000, addEventListener: (key, fn) => viewportEvents.set(key, fn), removeEventListener: (key) => viewportEvents.delete(key) };
  v.ResizeObserver = class { constructor(fn) { resizeObserver = fn; } observe(node) { observed.push(node); } disconnect() { disconnected = true; } };
  const clip = box(10, 600, 'auto'), element = box(-190, 1000, 'visible', clip);
  const properties = {}; element.style = { setProperty: (key, value) => { properties[key] = value; } };
  const cleanup = trackLoadingCenter(element, v); assert.equal(properties['--loading-center-x'], '500px');
  element.getBoundingClientRect = () => ({ left: 10, width: 1000, right: 1010 }); events.get('scroll')();
  assert.equal(properties['--loading-center-x'], '300px');
  v.visualViewport.width = 390; viewportEvents.get('resize')(); assert.equal(properties['--loading-center-x'], '190px');
  resizeObserver(); assert.equal(observed.length, 2); cleanup();
  assert.equal(events.size, 0); assert.equal(viewportEvents.size, 0); assert.ok(disconnected);
});
test('Missing ResizeObserver and absent root are safe', () => {
  assert.doesNotThrow(() => trackLoadingCenter(null, {})());
  const v = view(800); v.addEventListener = () => {}; v.removeEventListener = () => {};
  const element = box(0, 600); element.style = { setProperty() {} };
  assert.doesNotThrow(() => trackLoadingCenter(element, v)());
});
test('Shared component removes skeleton, keeps screen-reader status and 12 translucent petals', async () => {
  const read = async (path) => (await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
  const source = await read('components/LoadingIndicator.jsx'), css = await read('app/globals.css');
  assert.ok(!source.includes('app-loading__lines')); assert.ok(!css.includes('app-loading__lines'));
  assert.equal((source.match(/\['#[a-f0-9]{6}',/g) || []).length, 12);
  assert.ok(source.includes('fillOpacity={opacity}')); assert.ok(source.includes('index * 30'));
  for (const text of ['role="status"', 'aria-live="polite"', 'className="sr-only"', 'aria-label={label}']) assert.ok(source.includes(text));
  assert.ok(source.includes('if (!inline) return trackLoadingCenter'));
  assert.ok(css.includes('prefers-reduced-motion')); assert.ok(css.includes('animation:none'));
  assert.ok(!source.includes('fetch(')); assert.ok(!source.includes('http'));
});
