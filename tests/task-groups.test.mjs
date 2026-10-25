// Dependency-free unit tests. Database calls/transactions are MOCKED, not SQL Server.
// Run: node --experimental-vm-modules --test tests/task-groups.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../lib/task-groups.js', import.meta.url), 'utf8');
const normalizeDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/−/g, '-');
async function load(overrides = {}) {
  const log = []; const state = { committed: false, rolledBack: false, workCalled: false };
  const tx = async (sql, params) => {
    log.push({ sql, params });
    if (overrides.query) { const value = await overrides.query(sql, params); if (value !== undefined) return value; }
    if (sql.includes('AS Ready')) return [{ Ready: 1 }];
    if (sql.includes('SELECT MigrationKey')) return [{ MigrationKey: '20261025_001_task_groups' }];
    if (sql.includes('AS IndexCount')) return [{ IndexCount: 2, ForeignKeyCount: 7 }];
    if (sql.includes('AS LockResult')) return [{ LockResult: 0 }];
    if (sql.includes('FROM dbo.TaskGroup WITH')) return [{ GroupID: 1, IsActive: 1, Version: '0000000000000001' }];
    if (sql.includes('FROM dbo.TaskGroupMember')) return [{ TaskID: 101, SyncEnabled: 1, LeftAt: null }, { TaskID: 202, SyncEnabled: 1, LeftAt: null }, { TaskID: 303, SyncEnabled: 0, LeftAt: null }];
    if (sql.includes('FROM dbo.Follow_tbl')) return [{ FollowID: params[0], TaskID: params[1] }];
    if (sql.includes('UPDATE dbo.TaskGroup')) return [{ Version: '0000000000000002' }];
    throw Error('Unexpected SQL: ' + sql);
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => {
    const entries = name === 'server-only' ? {} : name === './assetRules' ? { normalizeDigits } : {
      runTransaction: async (fn) => { try { const result = await fn(tx); state.committed = true; return result; } catch (e) { state.rolledBack = true; throw e; } },
    };
    return new vm.SyntheticModule(Object.keys(entries), function () { for (const [k, v] of Object.entries(entries)) this.setExport(k, v); }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, log, state };
}
const options = { groupId: 1, originTaskId: 101, expectedVersion: '0000000000000001' };

test('IDs: strict integers, Persian/Arabic digits, sorted de-duplication and bounded lists', async () => {
  const { api } = await load();
  assert.equal(api.taskGroupId(' ۱۰۱ '), 101); assert.equal(api.taskGroupId('٢٠٢'), 202);
  for (const bad of ['', null, {}, true, 0, -1, '1e2', '1.0', '1;DELETE', '2147483648']) assert.throws(() => api.taskGroupId(bad));
  assert.deepEqual(Array.from(api.taskGroupIds(['۲۰۲', 101, 202])), [101, 202]);
  assert.throws(() => api.taskGroupIds([])); assert.equal(api.taskGroupIds([], { allowEmpty: true }).length, 0);
  assert.throws(() => api.taskGroupIds(Array(251).fill(1)));
  assert.equal(api.taskGroupVersion('00000000000000af'), '00000000000000AF');
  for (const bad of [null, '1', '0x0000000000000001', 'Z'.repeat(16)]) assert.throws(() => api.taskGroupVersion(bad));
});

test('No operation runs before schema readiness is confirmed', async () => {
  for (const matcher of ['AS Ready', 'SELECT MigrationKey', 'AS IndexCount']) {
    const { api, state, log } = await load({ query: (sql) => sql.includes(matcher) ? [] : undefined });
    await assert.rejects(() => api.runTaskGroupTransaction(options, () => { state.workCalled = true; }), (e) => e.code === 'TASK_GROUPS_NOT_READY' && e.status === 503);
    assert.equal(state.workCalled, false); assert.equal(state.rolledBack, true); assert(!log.some((q) => q.sql.includes('UPDATE')));
  }
});

test('Busy, inactive, stale group, missing membership and stale final version fail closed', async () => {
  const cases = [
    ['AS LockResult', [{ LockResult: -1 }], 'GROUP_BUSY'],
    ['FROM dbo.TaskGroup WITH', [], 'GROUP_INACTIVE'],
    ['FROM dbo.TaskGroup WITH', [{ GroupID: 1, IsActive: 0, Version: options.expectedVersion }], 'GROUP_INACTIVE'],
    ['FROM dbo.TaskGroup WITH', [{ GroupID: 1, IsActive: 1, Version: '000000000000000F' }], 'GROUP_CHANGED'],
    ['FROM dbo.TaskGroupMember', [{ TaskID: 999, SyncEnabled: 1 }], 'ORIGIN_NOT_MEMBER'],
    ['UPDATE dbo.TaskGroup', [], 'GROUP_CHANGED'],
  ];
  for (const [needle, reply, code] of cases) {
    const { api, state } = await load({ query: (sql) => sql.includes(needle) ? reply : undefined });
    await assert.rejects(() => api.runTaskGroupTransaction(options, () => {}), (e) => e.code === code && e.status === 409);
    assert.equal(state.committed, false); assert.equal(state.rolledBack, true);
  }
});

test('Explicit targets only: reject another group, departed member and sync exceptions', async () => {
  const { api } = await load();
  const members = [{ TaskID: 101, SyncEnabled: 1 }, { TaskID: 202, SyncEnabled: 0 }, { TaskID: 303, SyncEnabled: 1, LeftAt: 'past' }];
  assert.deepEqual(Array.from(api.resolveGroupSyncTargets(members, [101])), [101]);
  for (const ids of [[], [999], [202], [303], [101, 999]]) assert.throws(() => api.resolveGroupSyncTargets(members, ids));
});

test('Follow-up ownership and membership are checked on the transaction connection', async () => {
  const { api, log } = await load();
  await api.runTaskGroupTransaction(options, async ({ resolveSyncTargets, assertFollowOwner }) => {
    assert.deepEqual(Array.from(resolveSyncTargets([202, 101])), [101, 202]);
    await assertFollowOwner(500, 101);
    assert.throws(() => assertFollowOwner(500, 999), (e) => e.code === 'MEMBERSHIP_CHANGED');
  });
  const owner = log.find((q) => q.sql.includes('FROM dbo.Follow_tbl'));
  assert.deepEqual(Array.from(owner.params), [500, 101]); assert(owner.sql.includes('FollowID = ? AND TaskID = ?'));
  for (const q of log) assert.equal((q.sql.match(/\?/g) || []).length, q.params.length);
  const wrong = await load({ query: (sql) => sql.includes('FROM dbo.Follow_tbl') ? [{ FollowID: 500, TaskID: 202 }] : undefined });
  await assert.rejects(() => wrong.api.runTaskGroupTransaction(options, ({ assertFollowOwner }) => assertFollowOwner(500, 101)), (e) => e.code === 'FOLLOW_OWNER_MISMATCH');
  assert.equal(wrong.state.rolledBack, true);
});

test('Callback failure rolls back; successful operation returns the new group version', async () => {
  const broken = await load(); await assert.rejects(() => broken.api.runTaskGroupTransaction(options, () => { throw Error('failure'); }), /failure/);
  assert.equal(broken.state.rolledBack, true); assert(!broken.log.some((q) => q.sql.includes('UPDATE')));
  const good = await load();
  const result = await good.api.runTaskGroupTransaction(options, () => ({ saved: true }));
  assert.equal(result.value.saved, true); assert.equal(result.groupVersion, '0000000000000002'); assert.equal(good.state.committed, true);
  const update = good.log.find((q) => q.sql.includes('UPDATE dbo.TaskGroup'));
  assert.deepEqual(Array.from(update.params), [1, options.expectedVersion]);
  assert(!good.log.some((q) => /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:dbo\.)?(?:Tsk_tbl|Follow_tbl|TimeDate_tbl)\b/i.test(q.sql)));
});

test('Migration structure: guarded, transactional, unique current membership and owned follow links', async () => {
  const sql = await fs.readFile(new URL('../database/migrations/20261025_001_task_groups.sql', import.meta.url), 'utf8');
  for (const token of ['SET XACT_ABORT ON', 'BEGIN TRANSACTION', 'COMMIT TRANSACTION', 'ROLLBACK TRANSACTION', 'sp_getapplock', 'UX_TaskGroupMember_CurrentTask', 'WHERE LeftAt IS NULL', 'FOREIGN KEY (FollowID, TaskID) REFERENCES dbo.Follow_tbl(FollowID, TaskID)', 'Migration marker exists but the schema is incomplete']) assert(sql.includes(token), token);
  assert(!/ON DELETE CASCADE|DROP\s+TABLE|TRUNCATE\s+TABLE/i.test(sql));
  assert(!/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:dbo\.)?(?:Tsk_tbl|Follow_tbl|TimeDate_tbl)\b/i.test(sql));
  assert.equal((sql.match(/CREATE TABLE dbo\./g) || []).length, 6);
  // Static assertions only: SQL Server parsing/execution is NOT performed here.
});

test('Malformed command is rejected before opening any transaction', async () => {
  const { api, log } = await load();
  for (const bad of [null, {}, { ...options, groupId: '1 OR 1=1' }, { ...options, originTaskId: 0 }, { ...options, expectedVersion: 'bad' }]) await assert.rejects(() => api.runTaskGroupTransaction(bad, () => {}));
  await assert.rejects(() => api.runTaskGroupTransaction(options, null));
  assert.equal(log.length, 0);
});
