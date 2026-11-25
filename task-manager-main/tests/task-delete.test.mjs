// Database transactions are mocked. This is not a live SQL Server test.
// Run: node --experimental-vm-modules --test tests/task-delete.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const text = await fs.readFile(new URL('../app/api/tasks/[id]/route.js', import.meta.url), 'utf8');
const tables = ['TimeDate_tbl', 'Asset_Task_tbl', 'ApplicantFunctor_tbl', 'Follow_tbl', 'Folder_tbl', 'Tsk_tbl'];
async function setup({ exists = true, failTable, failure = Error('private SQL details') } = {}) {
  const log = [], state = { committed: false, rolledBack: false, transactions: 0 };
  const tx = async (sql, params) => {
    log.push({ sql, params });
    if (sql.startsWith('SELECT')) return exists ? [{ TaskID: 101 }] : [];
    if (sql.startsWith(`DELETE FROM ${failTable} `)) throw failure;
    return [];
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(text, { context });
  await module.link(async (name) => {
    const entries = name === 'next/server' ? { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, body }) } } : name === '@/lib/assetRules' ? { normalizeDigits: (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) } : {
      query: () => { throw Error('DELETE must never use the non-transaction query helper'); },
      runTransaction: async (fn) => { state.transactions++; try { const v = await fn(tx); state.committed = true; return v; } catch (e) { state.rolledBack = true; throw e; } },
    };
    return new vm.SyntheticModule(Object.keys(entries), function () { for (const [key, value] of Object.entries(entries)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return { route: module.namespace, log, state, remove: (id) => module.namespace.DELETE({}, { params: Promise.resolve({ id }) }) };
}
test('Successful deletion uses one transaction, six bound deletes and no undefined b', async () => {
  const { remove, log, state } = await setup();
  const result = await remove('۱۰۱');
  assert.equal(result.status, 200); assert.equal(result.body.success, true);
  assert.equal(state.transactions, 1); assert.equal(state.committed, true);
  assert(log[0].sql.includes('WITH (UPDLOCK, HOLDLOCK)'));
  assert.deepEqual(log.slice(1).map((item) => item.sql.split(' ')[2]), tables);
  for (const entry of log) { assert.deepEqual(Array.from(entry.params), [101]); assert.equal((entry.sql.match(/\?/g) || []).length, 1); }
});
test('Invalid IDs never reach the database', async () => {
  const { remove, log, state } = await setup();
  for (const id of ['', '0', '-1', '1.5', '1e2', '2147483648', '1; DELETE FROM Tsk_tbl']) assert.equal((await remove(id)).status, 400);
  assert.equal(log.length, 0); assert.equal(state.transactions, 0);
});
test('Already-deleted/missing task gives 404, without dependent deletes', async () => {
  const { remove, log } = await setup({ exists: false });
  assert.equal((await remove('101')).status, 404); assert.equal(log.length, 1);
});
test('Failure at each delete propagates to the transaction rollback path', async () => {
  for (const failTable of tables) {
    const { remove, log, state } = await setup({ failTable });
    const result = await remove('101');
    assert.equal(result.status, 500); assert.equal(result.body.success, false);
    assert.equal(state.committed, false); assert.equal(state.rolledBack, true);
    assert(!result.body.error.includes('private SQL details'));
    assert.equal(log.length, tables.indexOf(failTable) + 2);
  }
});
test('Foreign-key protection is preserved, including group-history references', async () => {
  for (const failure of [{ code: 547 }, { number: 547 }, { message: 'The DELETE statement conflicted with the REFERENCE constraint FK_Group' }, [{ code: 547 }], { errors: [{ number: 547 }] }]) {
    const { remove, state } = await setup({ failTable: 'Follow_tbl', failure });
    const result = await remove('101');
    assert.equal(result.status, 409); assert.equal(state.rolledBack, true); assert.equal(state.committed, false);
  }
});
test('Existing GET and PUT handlers are still exported', async () => {
  const { route } = await setup();
  assert.equal(typeof route.GET, 'function'); assert.equal(typeof route.PUT, 'function');
});
