// SQL is mocked: verifies validation, parameters and generated paging SQL, not a live SQL Server.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const routeSource = await read('app/api/task-inspector/search/route.js');
const rulesSource = await read('lib/assetRules.js');
const filtersSource = await read('lib/task-inspector-filters.js');
async function load(rows = []) {
  const calls = [], context = vm.createContext({});
  const rules = new vm.SourceTextModule(rulesSource, { context });
  await rules.link(() => { throw Error('Unexpected dependency'); }); await rules.evaluate();
  const route = new vm.SourceTextModule(routeSource, { context });
  await route.link((specifier) => {
    if (specifier === '@/lib/assetRules') return rules;
    const exports = specifier === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, ...options }) } }
      : specifier === '@/lib/db' ? { query: async (sql, params) => {
        calls.push({ sql, params: Array.from(params) });
        if (/COUNT\(DISTINCT/.test(sql)) return [{ total: 46 }];
        if (/SELECT DISTINCT/.test(sql)) return [{ v: '0.0' }, { v: '-3.0' }];
        return rows;
      } } : null;
    if (!exports) throw Error(`Unexpected dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await route.evaluate();
  const call = (body) => route.namespace.POST({ json: async () => body });
  return { calls, call };
}
for (const [label, value, expected] of [['zero decimal', '0.0', 0], ['negative', '-3.0', -3], ['fraction', '0.5', 0.5], ['Persian digits', '۰.۰', 0], ['Arabic digits', '٠.٠', 0], ['Unicode minus', '−۳.۰', -3]]) {
  test(`Floor ${label} is accepted and parameterized in count and rows`, async () => {
    const { call, calls } = await load([{ TaskID: 49911, Floor: expected }]);
    const response = await call({ mode: 'rows', filters: { Floor: [value] } });
    assert.equal(response.status, 200); assert.equal(response.body.rows.length, 1);
    assert.equal(calls.length, 2);
    for (const c of calls) { assert.match(c.sql, /asset\.Floor = \?/); assert.equal(c.params[0], expected); }
  });
}
for (const value of ['NaN', 'Infinity', '0 OR 1=1', '0.0.0', '1e2', '9007199254740992']) {
  test(`Reject invalid numeric filter: ${value}`, async () => {
    const { call, calls } = await load();
    assert.equal((await call({ mode: 'rows', filters: { Floor: [value] } })).status, 400);
    assert.equal(calls.length, 0);
  });
}
test('TaskID remains integer-only; AssetNumber decimal values remain usable', async () => {
  const { call, calls } = await load();
  assert.equal((await call({ mode: 'rows', filters: { TaskID: ['49911.0'] } })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await call({ mode: 'rows', filters: { AssetNumber: ['1.0'] } })).status, 200);
  assert.equal(calls[0].params[0], 1);
});
test('Default order is TaskID DESC before OFFSET', async () => {
  const { call, calls } = await load(); const response = await call({ mode: 'rows', page: 2 });
  assert.equal(response.status, 200);
  assert.match(calls[1].sql, /ORDER BY TaskID DESC OFFSET \? ROWS FETCH NEXT \? ROWS ONLY/);
  assert.deepEqual(calls[1].params, [20, 20]);
});
const sorts = { TaskID: 'TaskID', AssetName: 'AssetName', AssetNumber: 'TRY_CONVERT(decimal(38, 10), AssetNumber)', Building: 'Building', Block: 'Block', Floor: 'TRY_CONVERT(decimal(38, 10), Floor)', Entrance: 'Entrance', Location: 'Location', TaskTtl: 'TaskTtl', Descriptions: 'Descriptions', Priorities: 'Priorities', status: 'Complited', DueDateTime: 'DueDateTime', EndDateTime: 'EndDateTime' };
test('Every displayed column supports both global directions, stable ties and nulls last', async () => {
  for (const [key, expression] of Object.entries(sorts)) for (const direction of ['asc', 'desc']) {
    const { call, calls } = await load();
    const response = await call({ mode: 'rows', sort: { key, direction }, filters: { Floor: ['0.0'] }, page: 3 });
    assert.equal(response.status, 200);
    const expected = key === 'TaskID' ? `ORDER BY TaskID ${direction.toUpperCase()} OFFSET`
      : `ORDER BY CASE WHEN ${expression} IS NULL THEN 1 ELSE 0 END ASC, ${expression} ${direction.toUpperCase()}, TaskID DESC OFFSET`;
    assert.ok(calls[1].sql.includes(expected), key + direction);
    assert.deepEqual(calls[1].params, [0, 40, 20]);
    assert.equal(response.body.sort.key, key); assert.equal(response.body.sort.direction, direction);
  }
});
test('Sort injection, unknown keys/directions and arrays fail before querying', async () => {
  for (const sort of [{ key: 'TaskID; DROP TABLE Tsk_tbl', direction: 'asc' }, { key: '__proto__', direction: 'asc' }, { key: 'Floor', direction: 'desc;--' }, [], 'Floor']) {
    const { call, calls } = await load();
    assert.equal((await call({ mode: 'rows', sort })).status, 400); assert.equal(calls.length, 0);
  }
});
test('Option reads respect decimal filters in other columns and exclude their own filter', async () => {
  const { call, calls } = await load();
  const response = await call({ mode: 'options', field: 'Block', filters: { Floor: ['0.0'], Block: ['B'] } });
  assert.equal(response.status, 200); assert.deepEqual(calls[0].params, [0]);
  assert.match(calls[0].sql, /asset\.Floor = \?/);
});
test('Empty selection still yields no matches; text wildcard escaping is preserved', async () => {
  const { call, calls } = await load();
  await call({ mode: 'rows', filters: { Floor: [], TaskTtl: ['50%_[x]'] } });
  assert.ok(calls[0].sql.includes('(1 = 0)'));
  assert.deepEqual(calls[0].params, ['%50\\%\\_\\[x\\]%']);
});
test('Reads remain no-store and contain no database writes', async () => {
  const { call, calls } = await load(); const response = await call({ mode: 'rows' });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  for (const { sql } of calls) assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP)\b/i);
});
test('Actual sort helper toggles and resets new-column direction without changing prior state', async () => {
  const context = vm.createContext({});
  const rules = new vm.SourceTextModule(rulesSource, { context }); await rules.link(() => {}); await rules.evaluate();
  const helpers = new vm.SourceTextModule(filtersSource, { context }); await helpers.link(() => rules); await helpers.evaluate();
  const { nextInspectionSort, INSPECTION_COLUMNS } = helpers.namespace;
  const previous = { key: 'TaskID', direction: 'desc' };
  const first = nextInspectionSort(previous, 'Floor'); assert.equal(first.direction, 'asc'); assert.equal(first.key, 'Floor');
  assert.equal(nextInspectionSort(first, 'Floor').direction, 'desc'); assert.equal(previous.key, 'TaskID');
  assert.deepEqual(Array.from(INSPECTION_COLUMNS, (col) => col.key).sort(), Object.keys(sorts).sort());
});
test('UI wiring retains filters, resets page, cancels stale requests and validates unique IDs', async () => {
  const source = await read('components/TaskInspectionTable.jsx');
  assert.ok(source.includes("aria-sort={sort.key === column.key"));
  assert.ok(source.includes('onClick={() => changeSort(column.key)}'));
  assert.ok(source.includes("readInspectionSearch({ mode: 'rows', filters, sort, page, pageSize: 20 }"));
  assert.ok(source.includes('[filters, sort, page, started]'));
  assert.ok(source.includes('new Set(data.rows.map((row) => Number(row.TaskID))).size !== data.rows.length'));
  assert.ok(source.includes('data.sort?.key !== sort.key'));
  const action = source.slice(source.indexOf('const changeSort ='), source.indexOf('const turnPage ='));
  assert.ok(action.includes('invalidate(); onResultsChange(); closeMenu();')); assert.ok(action.includes('setPage(1)'));
  assert.ok(!action.includes('setFilters('));
  assert.ok(source.includes('inputRef.current?.focus()'));
});
