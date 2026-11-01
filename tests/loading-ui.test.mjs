// Executes actual request handlers with delayed fetch doubles; no real database/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const read = async (path) => (await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replace(/\r\n?/g, '\n');
const home = await read('app/page.js');
const table = await read('components/TaskTable.jsx');
const a = home.indexOf('  const loadTasks = useCallback('), b = home.indexOf('\n  useEffect(', a);
assert.ok(a > 0 && b > a);
function harness(type = 'daily') {
  const pending = [], state = { loading: false, error: '', rows: [], total: null };
  const c = vm.createContext({
    loadRequestRef: { current: 0 }, loadTypeRef: { current: type }, searchRowsRef: { current: [{ TaskID: 1 }] },
    PAGE_SIZE: 10, useCallback: (fn) => fn,
    setTasksLoading: (v) => { state.loading = v; }, setLoadError: (v) => { state.error = v; },
    setTasks: (v) => { state.rows = v; }, setTotalFiltered: (v) => { state.total = v; }, setNextSwitch: () => {},
    sortSearchRows: (rows) => rows, applyClientFilters: (rows) => rows,
    fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  vm.runInContext(home.slice(a, b) + '\nthis.run = loadTasks;', c);
  const answer = (index, body, ok = true) => pending[index].resolve({ ok, status: ok ? 200 : 503, json: async () => body, text: async () => 'safe failure' });
  return { run: c.run, state, pending, answer };
}
test('Main list switches to loading synchronously before its read resolves', async () => {
  const h = harness(); const promise = h.run({}, 1); assert.equal(h.state.loading, true);
  h.answer(0, { success: true, data: [], total: 0 }); await promise;
  assert.equal(h.state.loading, false); assert.equal(h.state.error, ''); assert.equal(h.state.rows.length, 0);
});
test('Successful populated result ends loading and retains returned records', async () => {
  const h = harness(), p = h.run({}, 1); h.answer(0, { success: true, data: [{ TaskID: 7 }], total: 1 }); await p;
  assert.equal(h.state.rows[0].TaskID, 7); assert.equal(h.state.loading, false);
});
test('An earlier response cannot stop a later request spinner or replace its rows', async () => {
  const h = harness(), first = h.run({}, 1), second = h.run({}, 2);
  h.answer(0, { success: true, data: [{ TaskID: 1 }], total: 1 }); await first;
  assert.equal(h.state.loading, true); assert.equal(h.state.rows.length, 0);
  h.answer(1, { success: true, data: [{ TaskID: 2 }], total: 1 }); await second;
  assert.equal(h.state.loading, false); assert.equal(h.state.rows[0].TaskID, 2);
});
test('Latest successful read is not overwritten by late failing read', async () => {
  const h = harness(), first = h.run({}, 1), second = h.run({}, 2);
  h.answer(1, { success: true, data: [{ TaskID: 2 }], total: 1 }); await second;
  h.pending[0].reject(Error('old failure')); await first;
  assert.equal(h.state.error, ''); assert.equal(h.state.rows[0].TaskID, 2); assert.equal(h.state.loading, false);
});
for (const kind of ['http', 'body', 'network', 'json']) test(`Failure ${kind} ends spinner and sets error, not an empty-success state`, async () => {
  const h = harness(), p = h.run({}, 1);
  if (kind === 'http') h.answer(0, {}, false);
  if (kind === 'body') h.answer(0, { success: false, error: 'safe error' });
  if (kind === 'network') h.pending[0].reject(Error('network'));
  if (kind === 'json') h.pending[0].resolve({ ok: true, json: async () => { throw Error('bad JSON'); } });
  await p; assert.equal(h.state.loading, false); assert.ok(h.state.error);
});
test('Local search path also releases loading in finally', async () => {
  const h = harness('search'); await h.run({}, 1); assert.equal(h.pending.length, 0); assert.equal(h.state.loading, false); assert.equal(h.state.rows.length, 1);
});
test('Table empty row is gated by successful finished read for both initial and filtered empty results', () => {
  const expression = table.match(/\{(!loading && !loadError && sorted.length === 0 && !draftActive) && \(/)?.[1]; assert.ok(expression);
  for (const loading of [true, false]) for (const loadError of ['', 'failed']) {
    const result = vm.runInNewContext(expression, { loading, loadError, sorted: [], draftActive: false });
    assert.equal(Boolean(result), !loading && !loadError);
  }
  assert.ok(table.includes('{loading ? <LoadingIndicator label="دریافت کارها" />'));
  assert.ok(table.includes('{!loading && !loadError && sorted.map'));
  assert.ok(home.includes('loading={tasksLoading || searchLoading}'));
});
test('Indicator has accessible status, hidden label, decorative animation and reduced motion', async () => {
  const source = await read('components/LoadingIndicator.jsx'), css = await read('app/globals.css');
  for (const text of ['role="status"', 'aria-live="polite"', 'aria-label={label}', 'className="sr-only"', 'aria-hidden="true"']) assert.ok(source.includes(text));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)')); assert.ok(css.includes('animation:none'));
  assert.ok(!source.includes('fetch(')); assert.ok(!css.includes('transition: all'));
});
test('Initial forms have loading/error boundary instead of editable empty/default values', async () => {
  for (const name of ['TaskForm', 'TimeDateModal', 'SupplierModal', 'ApplicantFunctorModal', 'FolderModal', 'SettingsModal']) {
    const source = await read(`components/${name}.jsx`); assert.ok(source.includes('<ReadLoadingModal'), name);
  }
  const modal = await read('components/ReadLoadingModal.jsx'); assert.ok(modal.includes('onClick={onClose}')); assert.ok(modal.includes('role="alert"'));
});
test('Persons, devices, fixed schedule and follows guard their empty messages during reads/errors', async () => {
  const requirements = [
    ['PersonsModal', '!reading && !readError && list.length === 0'],
    ['AssetsModal', '!readingAssets && !assetReadError && filtered.length === 0'],
    ['FollowModal', '!readingRows && !readError && rows.length === 0'],
    ['TimeDateModal', '!fixedLoading && !fixedError && fixedRows.length === 0'],
  ];
  for (const [file, condition] of requirements) assert.ok((await read(`components/${file}.jsx`)).includes(condition), file);
});
test('File and folder browsers start pending; errors and read indicators remain distinct', async () => {
  for (const file of ['FileBrowser', 'FolderBrowser']) {
    const source = await read(`components/${file}.jsx`); assert.ok(source.includes('const [loading, setLoading] = useState(true)'));
    assert.ok(source.includes('{loading && <LoadingIndicator')); assert.ok(source.includes('token !== loadSequenceRef.current'));
  }
  const dwg = await read('components/DwgBrowser.jsx'); assert.ok(dwg.includes('!busy && !msg && dirs.length === 0'));
});
test('Inspection sorting/page changes become pending before clearing old rows', async () => {
  const source = await read('components/TaskInspectionTable.jsx'); assert.ok(source.includes('setLoading(nextStarted)'));
  assert.ok(source.includes('const turnPage = (next) => { invalidate(); onResultsChange(); setLoading(true)'));
  assert.ok(source.includes('{loading ? <LoadingIndicator label="جستجوی کارها" />'));
});
test('Filter option errors are not presented as empty matches', () => {
  assert.ok(table.includes('setMenuError("دریافت گزینه‌های فیلتر ناموفق بود.")'));
  assert.equal((table.match(/!menuLoading && !menuError && shownValues.length === 0/g) || []).length, 2);
});

test('Search handoff cancels an old main request and releases its obsolete spinner', () => {
  assert.equal((home.match(/loadRequestRef\.current\+\+;\s*setTasksLoading\(false\); setLoadError\(""\);/g) || []).length, 2);
});
