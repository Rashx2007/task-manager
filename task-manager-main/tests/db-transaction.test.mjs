// Tests the real helper with a mocked msnodesqlv8 connection, not a SQL Server.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../lib/db.js', import.meta.url), 'utf8');
async function harness({ fail, openError, closeError, throwClose } = {}) {
  const log = [], warnings = [];
  const conn = {
    query(text, params, callback) { log.push({ kind: 'query', text, params }); queueMicrotask(() => callback(fail && text.includes(fail) ? Error('injected ' + fail) : null, [{ value: 7 }])); },
    close(callback) { log.push({ kind: 'close' }); if(throwClose) throw Error('cleanup'); queueMicrotask(() => callback(closeError ? Error('cleanup') : null)); },
  };
  const sql = {
    open(cs, callback) { log.push({ kind: 'open', cs }); queueMicrotask(() => callback(openError || null, conn)); },
    query(cs, text, params, callback) { log.push({ kind: 'global-query', cs, text, params }); queueMicrotask(() => callback(null, [])); },
  };
  const context = vm.createContext({ process: { env: { DB_SERVER: 'test-server', DB_NAME: 'test-db' } }, console: { warn: s => warnings.push(s) } });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => new vm.SyntheticModule(['default'], function() { this.setExport('default', sql); }, { context })); await module.evaluate();
  return { api: module.namespace, log, warnings };
}
test('One opened connection executes BEGIN, work and COMMIT, then closes before resolving', async () => {
  const h = await harness(); const value = await h.api.runTransaction(async tx => (await tx('WORK ?', [12]))[0].value);
  assert.equal(value, 7); assert.deepEqual(h.log.map(r => r.kind), ['open','query','query','query','close']);
  assert.deepEqual(h.log.filter(r=>r.kind==='query').map(r=>r.text), ['SET XACT_ABORT ON; BEGIN TRAN','WORK ?','COMMIT TRAN']); assert.equal(h.log[2].params[0],12); assert.ok(h.log[0].cs.includes('Database=test-db;'));
});
test('Work failure rolls back, closes and preserves the original error', async () => {
  const h=await harness(); const error=Error('work failed'); await assert.rejects(h.api.runTransaction(()=>{throw error;}), e=>e===error);
  assert.equal(h.log.at(-2).text,'IF XACT_STATE() <> 0 ROLLBACK TRAN'); assert.equal(h.log.at(-1).kind,'close'); assert.ok(!h.log.some(r=>r.text==='COMMIT TRAN'));
});
test('Query, BEGIN and COMMIT errors each cause guarded rollback and one close', async () => {
  for (const fail of ['WORK','BEGIN TRAN','COMMIT TRAN']) { const h=await harness({fail}); await assert.rejects(h.api.runTransaction(tx=>tx('WORK')),new RegExp(fail)); assert.equal(h.log.at(-2).text,'IF XACT_STATE() <> 0 ROLLBACK TRAN'); assert.equal(h.log.filter(r=>r.kind==='close').length,1); }
});
test('Open error does not run work or attempt closing an unopened connection', async () => {
  const error=Error('cannot connect'), h=await harness({openError:error}); await assert.rejects(h.api.runTransaction(()=>{throw Error('must not run');}), e=>e===error); assert.equal(h.log.length,1);
});
test('Cleanup errors do not report failure after a successful commit', async () => {
  for (const options of [{closeError:true},{throwClose:true}]) { const h=await harness(options); assert.equal(await h.api.runTransaction(()=>42),42); assert.equal(h.warnings.length,1); assert.equal(h.log.filter(r=>r.kind==='close').length,1); }
});
test('Existing standalone query and queryMaster retain their target databases', async () => {
  const h=await harness(); await h.api.query('SELECT ?', [1]); await h.api.queryMaster('SELECT ?', [2]); assert.ok(h.log[0].cs.includes('Database=test-db;')); assert.ok(h.log[1].cs.includes('Database=master;')); assert.equal(h.log[0].params[0],1); assert.equal(h.log[1].params[0],2);
});
