// HTTP/SQL adapter tests use mocked database calls. No SQL Server connection.
// Run: node --experimental-vm-modules --test tests/task-group-reader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const readerText = await fs.readFile(new URL('../lib/task-group-reader.js', import.meta.url), 'utf8');
const routeText = await fs.readFile(new URL('../app/api/task-groups/route.js', import.meta.url), 'utf8');
const foundationText = await fs.readFile(new URL('../lib/task-groups.js', import.meta.url), 'utf8');
const normalizeDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/−/g, '-');
const VERSION = '0000000000000001';
const fixture = (TaskID, extra = {}) => ({ MemberID: String(TaskID), GroupID: 1, TaskID, SyncEnabled: 1,
  MemberVersion: VERSION, TaskTtl: `Task ${TaskID}`, Complited: 0, AssetID: 22, AssetName: 'پمپ',
  AssetNumber: 0, Floor: 0, AssetMappingCount: 1, TimeDateRowCount: 1, ...extra });
async function setup({ noGroup = false, override } = {}) {
  const log = [];
  const query = async (sql, params) => {
    log.push({ sql, params });
    if (override) { const value = await override(sql, params); if (value !== undefined) return value; }
    if (sql.includes('AS Ready')) return [{ Ready: 1 }];
    if (sql.includes('SELECT MigrationKey')) return [{ MigrationKey: '20261025_001_task_groups' }];
    if (sql.includes('AS IndexCount')) return [{ IndexCount: 2, ForeignKeyCount: 7 }];
    if (sql.includes('SELECT TaskID FROM dbo.Tsk_tbl')) return [{ TaskID: params[0] }];
    if (sql.includes('SELECT GroupID FROM dbo.TaskGroupMember')) return noGroup ? [] : [{ GroupID: 1 }];
    if (sql.includes('FROM dbo.TaskGroup WHERE')) return [{ GroupID: 1, Title: 'سرویس پمپ‌ها', IsActive: 1, Version: VERSION }];
    if (sql.includes('FROM dbo.TaskGroupMember member')) return [fixture(202, { SyncEnabled: 0 }), fixture(101)];
    if (sql.includes('FROM dbo.TaskGroup groupRow')) return [{ GroupID: 1, Version: VERSION }];
    throw Error('Unexpected query');
  };
  const context = vm.createContext({ URL });
  const cache = new Map();
  const moduleFor = (name) => {
    if (cache.has(name)) return cache.get(name);
    let mod;
    const text = { reader: readerText, route: routeText, foundation: foundationText }[name];
    if (text) mod = new vm.SourceTextModule(text, { context, identifier: name });
    else {
      const entries = name === 'server-only' ? {} : name === 'assets' ? { normalizeDigits } : name === 'next/server' ? { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } } : {
        query, runTransaction: () => { throw Error('Read endpoint must not open a write transaction'); },
      };
      mod = new vm.SyntheticModule(Object.keys(entries), function () { for (const [key, value] of Object.entries(entries)) this.setExport(key, value); }, { context });
    }
    cache.set(name, mod); return mod;
  };
  const route = moduleFor('route');
  await route.link((name) => moduleFor({ '@/lib/task-group-reader': 'reader', '@/lib/task-groups': 'foundation', './task-groups': 'foundation', './db': 'db', './assetRules': 'assets' }[name] || name));
  await route.evaluate();
  return { log, route: route.namespace, get: (query = 'taskId=101') => route.namespace.GET({ url: 'https://example.test/api/task-groups?' + query }) };
}

test('Existing ungrouped task returns success with null group and an empty member list', async () => {
  const { get, log } = await setup({ noGroup: true }); const result = await get();
  assert.equal(result.status, 200); assert.equal(result.body.success, true); assert.equal(result.body.data.taskId, 101);
  assert.equal(result.body.data.group, null); assert.equal(result.body.data.members.length, 0); assert.equal(result.body.data.warnings.length, 0);
  assert(!log.some((row) => row.sql.includes('FROM dbo.TaskGroup WHERE')));
});

test('Grouped task exposes group/member versions, original identity and zero-valued asset fields', async () => {
  const { get } = await setup(); const data = (await get()).body.data;
  assert.equal(data.group.GroupID, 1); assert.equal(data.group.Version, VERSION); assert.equal(data.members.length, 2);
  const origin = data.members.find((row) => row.IsOriginTask); assert.equal(origin.TaskID, 101); assert.equal(origin.Floor, 0); assert.equal(origin.AssetNumber, 0); assert.equal(origin.MemberVersion, VERSION);
});

test('Follow-up propagation exceptions remain visible as current group members', async () => {
  const { get, log } = await setup(); const data = (await get()).body.data;
  assert.equal(data.members.find((row) => row.TaskID === 202).SyncEnabled, 0);
  const membersSQL = log.find((row) => row.sql.includes('FROM dbo.TaskGroupMember member')).sql;
  assert(membersSQL.includes('member.LeftAt IS NULL')); assert(!/WHERE[\s\S]*member\.SyncEnabled\s*=\s*1/i.test(membersSQL));
});

test('GET-only, no-store response and strictly SELECT-only parameterized database calls', async () => {
  const { get, log, route } = await setup(); const response = await get();
  assert.deepEqual(Object.keys(route).sort(), ['GET', 'dynamic']); assert.equal(route.dynamic, 'force-dynamic'); assert.equal(response.headers['Cache-Control'], 'no-store');
  for (const entry of log) { assert(/^SELECT\b/.test(entry.sql.trim())); assert(!/\b(INSERT|UPDATE|DELETE|MERGE|EXEC|ALTER|DROP)\b/i.test(entry.sql)); assert.equal((entry.sql.match(/\?/g) || []).length, entry.params.length); }
  const membersQuery = log.find((row) => row.sql.includes('FROM dbo.TaskGroupMember member')); assert.deepEqual(Array.from(membersQuery.params), [1]); assert(membersQuery.sql.includes('ORDER BY member.TaskID DESC'));
});

test('Missing, duplicate, malformed or out-of-range task IDs are rejected before SQL', async () => {
  const { get, log } = await setup();
  for (const query of ['', 'taskId=', 'taskId=0', 'taskId=-1', 'taskId=1.5', 'taskId=1e2', 'taskId=2147483648', 'taskId=1%3BDELETE', 'taskId=101&taskId=202']) assert.equal((await get(query)).status, 400, query);
  assert.equal(log.length, 0); assert.equal((await get('taskId=' + encodeURIComponent('۱۰۱'))).status, 200);
});

test('Missing task returns 404 without looking up membership', async () => {
  const { get, log } = await setup({ override: (sql) => sql.includes('SELECT TaskID FROM dbo.Tsk_tbl') ? [] : undefined });
  const response = await get(); assert.equal(response.status, 404); assert.equal(response.body.code, 'TASK_NOT_FOUND'); assert(!log.some((row) => row.sql.includes('FROM dbo.TaskGroupMember')));
});

test('Missing migration or broken safety constraints fail closed with 503', async () => {
  for (const marker of ['AS Ready', 'SELECT MigrationKey', 'AS IndexCount']) {
    const { get } = await setup({ override: (sql) => sql.includes(marker) ? [] : undefined });
    assert.equal((await get()).status, 503);
  }
});

test('Inactive, missing or invalid-version group fails instead of guessing membership', async () => {
  for (const reply of [[], [{ GroupID: 1, IsActive: 0, Version: VERSION }], [{ GroupID: 1, IsActive: 1, Version: 'bad' }], [{ GroupID: 2, IsActive: 1, Version: VERSION }]]) {
    const { get } = await setup({ override: (sql) => sql.includes('FROM dbo.TaskGroup WHERE') ? reply : undefined });
    assert.equal((await get()).status, 409);
  }
});

test('Changed group version or departed origin during the read returns 409', async () => {
  for (const reply of [[], [{ GroupID: 1, Version: '0000000000000002' }]]) {
    const { get } = await setup({ override: (sql) => sql.includes('FROM dbo.TaskGroup groupRow') ? reply : undefined });
    const response = await get(); assert.equal(response.status, 409); assert.equal(response.body.code, 'GROUP_SNAPSHOT_CHANGED');
  }
});

test('Wrong-group, duplicated, missing-origin or oversized membership responses are rejected', async () => {
  for (const rows of [[], [fixture(202)], [fixture(101), fixture(101)], [fixture(101, { GroupID: 2 })], [fixture(101, { SyncEnabled: null })], [fixture(101, { MemberVersion: 'bad' })], Array.from({ length: 251 }, (_, index) => fixture(index + 1))]) {
    const { get } = await setup({ override: (sql) => sql.includes('FROM dbo.TaskGroupMember member') ? rows : undefined });
    assert.equal((await get()).status, 409);
  }
});

test('Multiple device mappings or schedule rows are warned about, not silently resolved', async () => {
  const { get, log } = await setup({ override: (sql) => sql.includes('FROM dbo.TaskGroupMember member') ? [fixture(101, { AssetMappingCount: 2, AssetID: null, AssetName: null, TimeDateRowCount: 2, Priorities: null, DueDateTime: null, EndDateTime: null })] : undefined });
  const data = (await get()).body.data;
  assert.deepEqual(Array.from(data.warnings, (warning) => warning.code), ['AMBIGUOUS_ASSET', 'MULTIPLE_SCHEDULE_ROWS']);
  assert.equal(data.members[0].AssetID, null); assert.equal(data.members[0].DueDateTime, null);
  const sql = log.find((row) => row.sql.includes('FROM dbo.TaskGroupMember member')).sql;
  assert(sql.includes('WHEN mapping.MappingCount = 1')); assert(sql.includes('WHEN schedule.ScheduleCount = 1'));
});

test('Unexpected database errors are masked and responses remain non-cacheable', async () => {
  const { get } = await setup({ override: () => { throw Error('SECRET_SQL_DETAILS'); } });
  const response = await get(); assert.equal(response.status, 500); assert(!response.body.error.includes('SECRET')); assert.equal(response.headers['Cache-Control'], 'no-store');
});
