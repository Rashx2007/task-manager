// Integration with a stateful SQL double: NOT a real SQL Server/ODBC test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXED = 'زمان انجام ثابت';
const version = '0000000000000001';
const code = wanted => e => e.code === wanted;
function fixture(grouped = true) {
  return {
    groups: grouped ? [{ GroupID: 1, IsActive: 1, Version: version }] : [],
    members: grouped ? [1, 2].map(TaskID => ({ TaskID, GroupID: 1, LeftAt: null, SyncEnabled: 1 })) : [],
    tasks: [1, 2, 3].map(TaskID => ({ TaskID, Complited: 0, Priorities: '3.متوسط', FixedDueTime: 0, Submit_Date: '2026-10-25 08:00:00', LastFollow: null })),
    times: [1, 2, 3].map(TaskID => ({ TaskID, TimeDateID: TaskID, Priorities: '3.متوسط', FixedDueTime: 0, Durationtime: '01:00:00', DueDateTime: `2026-10-26 ${TaskID === 3 ? '09' : '08'}:00:00`, EndDateTime: `2026-10-26 ${TaskID === 3 ? '10' : '09'}:00:00` })),
    follows: [], batches: [], links: [], ready: true,
  };
}
async function harness(initial = fixture(), options = {}) {
  let data = structuredClone(initial), commits = 0, rollbacks = 0;
  const calls = [], writes = [];
  const NativeDate = Date;
  class Clock extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [2026, 9, 26, 8, 0, 0])); }
    static [Symbol.hasInstance](v) { return v instanceof NativeDate; }
  }
  const ctx = vm.createContext({ Date: Clock, console });
  const wall = d => d instanceof NativeDate ? d.toISOString().slice(0, 19).replace('T', ' ') : d;
  const time = tid => data.times.find(r => r.TaskID === Number(tid));
  const task = tid => data.tasks.find(r => r.TaskID === Number(tid));
  const scheduled = () => data.times.filter(r => task(r.TaskID)?.Complited === 0);
  async function tx(raw, params = []) {
    const sql = raw.replace(/\s+/g, ' ').trim(), compact = sql.replace(/\s/g, '');
    calls.push({ sql, params });
    if (/^(UPDATE|INSERT|DELETE)/.test(sql) || sql.includes('scheduler:touch')) {
      writes.push({ sql, params });
      if (options.failWrite === writes.length) throw new Error('injected SQL failure');
    }
    if (sql.includes('AS LockResult')) return [{ LockResult: options.busy ? -1 : 0 }];
    if (sql.includes('AS Ready')) return [{ Ready: data.ready ? 1 : 0 }];
    if (sql.startsWith('SELECT MigrationKey')) return [{ MigrationKey: '20261025_001_task_groups' }];
    if (sql.includes('AS IndexCount')) return [{ IndexCount: 2, ForeignKeyCount: 7 }];
    if (sql.includes('scheduler:groups')) return data.groups.map(r => ({ ...r }));
    if (sql.includes('scheduler:members')) return data.members.map(r => ({ ...r }));
    if (sql.includes('scheduler:owner')) return data.tasks.filter(r => r.TaskID === params[0]).map(r => ({ ...r }));
    if (sql.includes('scheduler:tasks')) return data.tasks.filter(r => r.Complited === 0 || data.members.some(m => m.TaskID === r.TaskID)).flatMap(r => {
      const rows = data.times.filter(t => t.TaskID === r.TaskID);
      return (rows.length ? rows : [{}]).map(t => ({ ...r, TaskPriority: r.Priorities, TaskFixed: r.FixedDueTime, ...t }));
    });
    if (sql.includes('scheduler:priority-names') || sql === 'SELECT TaskID, Priorities FROM Tsk_tbl ORDER BY DueDateTime') return data.tasks.map(r => ({ ...r }));
    if (sql.includes('scheduler:activity')) return data.tasks.filter(r => r.Complited === 0).map(r => ({ ...r }));
    if (sql.includes('scheduler:touch')) {
      const g = data.groups.find(r => r.GroupID === params[0] && r.Version === params[1]);
      if (!g || options.staleTouch) return [];
      g.Version = (BigInt('0x' + g.Version) + 1n).toString(16).padStart(16, '0').toUpperCase(); return [{ Version: g.Version }];
    }
    if (sql.includes('SELECT StartWorkTime')) return [{ StartWorkTime: '07:30', restTimeStart: '12:00', restTimeEnd: '13:00', EndWorkTime: '16:00' }];
    if (sql.startsWith('SELECT TimeDateID')) return time(params[0]) ? [{ TimeDateID: time(params[0]).TimeDateID }] : [];
    if (compact.startsWith('UPDATETimeDate_tblSETPriorities=?,FixedDueTime=?')) {
      Object.assign(time(params[5]), { Priorities: params[0], FixedDueTime: params[1], Durationtime: params[2], DueDateTime: params[3], EndDateTime: params[4] }); return [];
    }
    if (sql.startsWith('INSERT INTO TimeDate_tbl')) {
      data.times.push({ TaskID: params[0], TimeDateID: 100 + data.times.length, Priorities: params[3], FixedDueTime: params[4], Durationtime: params[5], DueDateTime: params[6], EndDateTime: params[7] }); return [];
    }
    if (compact.startsWith('UPDATETsk_tblSETPriorities=?,fixedDueTime=?')) {
      Object.assign(task(params[9]), { Priorities: params[0], FixedDueTime: params[1], Durationtime: params[2], DueDateTime: params[3], EndDateTime: params[4] }); return [];
    }
    if (sql.startsWith('UPDATE Tsk_tbl SET Temporary')) { task(params[0]).Temporary = 0; return []; }
    if (/^UPDATE (Tsk_tbl|TimeDate_tbl) SET Priorities\s*=\s*\? WHERE/.test(sql)) {
      const row = sql.startsWith('UPDATE Tsk') ? task(params[1]) : time(params[1]); if (row) row.Priorities = params[0]; return [];
    }
    if (sql.startsWith('INSERT INTO dbo.TaskGroupFollowBatch')) { data.batches.push({ BatchID: params[0], GroupID: params[1], OriginTaskID: params[2] }); return []; }
    if (sql.startsWith('INSERT INTO dbo.TaskGroupFollowLink')) { data.links.push({ BatchID: params[0], TaskID: params[1], FollowID: params[2] }); return []; }
    if (sql.startsWith('INSERT INTO Follow_tbl')) { const id = data.follows.length + 100; data.follows.push({ FollowID: id, TaskID: params[0], params }); return [{ FollowID: id }]; }
    if (sql.startsWith('UPDATE TimeDate_tbl SET DueDateTime')) { Object.assign(time(params[2]), { DueDateTime: params[0], EndDateTime: params[1] }); return []; }
    if (sql.includes("TD.Priorities = N'زمان انجام ثابت'")) {
      return scheduled().filter(r => r.Priorities === FIXED && r.TaskID !== params[4] && wall(r.DueDateTime) < params[1] && wall(r.EndDateTime) > params[0]);
    }
    if (sql.startsWith('SELECT DISTINCT TD.TaskID')) return scheduled().filter(r => !r.FixedDueTime && r.TaskID !== params[3] && wall(r.EndDateTime) > params[0]);
    if (sql.includes('WHERE TD.Priorities > ?')) return scheduled().filter(r => !r.FixedDueTime && r.Priorities > params[0] && r.TaskID !== params[1]);
    if (sql.startsWith('SELECT TOP 1 TD.EndDateTime')) return scheduled().filter(r => !r.FixedDueTime).slice(-1);
    if (sql.includes("TD.Priorities <> N'زمان انجام ثابت'")) return scheduled().filter(r => r.Priorities !== FIXED).map(r => ({ ...r }));
    if (sql.includes('(TD.FixedDueTime = 1)')) return scheduled().filter(r => r.FixedDueTime).map(r => ({ ...r }));
    throw new Error('Unhandled SQL in double: ' + sql);
  }
  const db = new vm.SyntheticModule(['query', 'runTransaction'], function () {
    this.setExport('query', () => { throw new Error('Global query escaped transaction'); });
    this.setExport('runTransaction', async work => { const before = structuredClone(data); try { const v = await work(tx); commits++; return v; } catch(e) { data = before; rollbacks++; throw e; } });
  }, { context: ctx });
  const cache = new Map([['db', db]]);
  async function load(name) {
    if (cache.has(name)) return cache.get(name);
    let mod;
    if (name === 'server-only') mod = new vm.SyntheticModule([], function () {}, { context: ctx });
    else if (name === 'assetRules') mod = new vm.SyntheticModule(['normalizeDigits'], function () { this.setExport('normalizeDigits', v => String(v ?? '').replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))); }, { context: ctx });
    else if (name === 'node:crypto') mod = new vm.SyntheticModule(['randomUUID'], function () { this.setExport('randomUUID', () => '00000000-0000-4000-8000-000000000001'); }, { context: ctx });
    else mod = new vm.SourceTextModule(await fs.readFile(path.join(root, 'lib', name.endsWith('.mjs') ? name : name + '.js'), 'utf8'), { context: ctx, identifier: name });
    cache.set(name, mod); return mod;
  }
  const module = await load('group-scheduler-service');
  await module.link(spec => load(spec.startsWith('./') ? spec.slice(2) : spec)); await module.evaluate();
  return { api: module.namespace, data: () => data, calls, writes, stats: () => ({ commits, rollbacks }) };
}

test('A group reserves one interval, including SyncEnabled=0; independent task follows once', async () => {
  const f = fixture(); f.members[1].SyncEnabled = 0;
  const h = await harness(f); assert.equal(await h.api.rescheduleTasks(), 3);
  assert.equal(h.data().times[0].DueDateTime, '2026-10-26 08:10:00');
  assert.equal(h.data().times[1].EndDateTime, '2026-10-26 09:10:00');
  assert.equal(h.data().times[2].DueDateTime, '2026-10-26 09:10:00');
  assert.equal(h.data().groups[0].Version, '0000000000000002');
  assert.equal(h.calls[0].params[0], 'task-manager:schedule');
});
test('Completed members retain old records and consume no shared interval', async () => {
  const f = fixture(); f.tasks[1].Complited = 1;
  const h = await harness(f); assert.equal(await h.api.rescheduleTasks(), 2);
  assert.deepEqual(h.data().times[1], f.times[1]);
});
test('Group edit requires matching version before any writes', async () => {
  for (const [expectedGroupVersion, wanted] of [[undefined,'GROUP_VERSION_REQUIRED'],['00000000000000FF','GROUP_CHANGED']]) {
    const h = await harness(); await assert.rejects(h.api.saveTaskSchedule({ taskId: 1, priority: '2.بالا', hours: 1, expectedGroupVersion }), code(wanted)); assert.equal(h.writes.length, 0);
  }
});
test('Manual group priority/duration applies to all active members, even follow-excluded members', async () => {
  const f = fixture(); f.members[1].SyncEnabled = 0;
  const h = await harness(f); const r = await h.api.saveTaskSchedule({ taskId: 1, priority: '2.بالا', hours: '۲', minutes: 0, expectedGroupVersion: version });
  assert.deepEqual(Array.from(r.affectedTaskIds), [1,2]); assert.equal(r.groupVersion, '0000000000000002');
  for (const id of [0,1]) { assert.equal(h.data().times[id].Priorities, '2.بالا'); assert.equal(h.data().times[id].Durationtime, '02:00:00'); assert.equal(h.data().times[id].EndDateTime, '2026-10-26 10:10:00'); }
});
test('Manual independent task edit also works while other tasks have a group', async () => {
  const h = await harness(); const r = await h.api.saveTaskSchedule({ taskId: 3, priority: '1.خیلی بالا', hours: 1 }); assert.equal(r.groupVersion, null); assert.equal(h.data().times[2].DueDateTime, '2026-10-26 08:10:00');
});
test('Fixed conflict is caught before writes and preserves overlap response contract', async () => {
  const f = fixture(); Object.assign(f.tasks[2], { Priorities: FIXED, FixedDueTime: 1 }); Object.assign(f.times[2], { Priorities: FIXED, FixedDueTime: 1 });
  const h = await harness(f); let err;
  try { await h.api.saveTaskSchedule({ taskId: 1, priority: FIXED, startLocal: '2026-10-26 09:00:00', endLocal: '2026-10-26 10:00:00', expectedGroupVersion: version }); } catch(e) { err=e; }
  assert.equal(err?.code, 'FIXED_CONFLICT'); assert.equal(h.writes.length, 0); const r = h.api.schedulerFailure(err); assert.equal(r.status, 200); assert.equal(r.body.overlap, true); assert.deepEqual(Array.from(r.body.conflicts).sort(), [1,2,3]);
});
test('Fixed group shifts each member exactly once, not once per member', async () => {
  const f = fixture(); for (const i of [0,1]) { Object.assign(f.tasks[i], { Priorities: FIXED, FixedDueTime: 1 }); Object.assign(f.times[i], { Priorities: FIXED, FixedDueTime: 1 }); }
  const h = await harness(f); await h.api.moveFixedTaskSchedules(30);
  for (const i of [0,1]) assert.equal(h.data().times[i].DueDateTime, '2026-10-26 08:30:00');
});
test('Newest activity among active members prevents premature automatic increase', async () => {
  const f = fixture(); f.tasks[0].Submit_Date = '2026-10-01 08:00:00'; f.tasks[1].LastFollow = '2026-10-25 08:00:00';
  const h = await harness(f); assert.equal(await h.api.increaseTaskPriorities(), 0); assert.equal(h.writes.length, 0);
});
test('All stale group members share automatic priority and linked audit rows, including SyncEnabled=0', async () => {
  const f = fixture(); f.members[1].SyncEnabled = 0; for (const i of [0,1]) f.tasks[i].Submit_Date = '2026-10-01 08:00:00';
  const h = await harness(f); assert.equal(await h.api.increaseTaskPriorities(), 2);
  assert.equal(h.data().tasks[0].Priorities, '2.بالا'); assert.equal(h.data().tasks[1].Priorities, '2.بالا');
  assert.equal(h.data().batches.length, 1); assert.equal(h.data().links.length, 2); assert.equal(h.data().follows.length, 2);
  assert.equal(h.data().times[0].DueDateTime, h.data().times[1].DueDateTime);
});
test('Completed members are excluded from automatic activity baseline', async () => {
  const f = fixture(); f.tasks[1].Complited = 1; f.tasks[0].Submit_Date = '2026-10-01 08:00:00';
  const h = await harness(f); assert.equal(await h.api.increaseTaskPriorities(), 1); assert.equal(h.data().tasks[1].Priorities, '3.متوسط');
});
test('Mismatched group priorities reject automatic increase without writes', async () => {
  const f = fixture(); f.tasks[1].Priorities = '2.بالا'; const h = await harness(f); await assert.rejects(h.api.increaseTaskPriorities(), code('GROUP_PRIORITY_MISMATCH')); assert.equal(h.writes.length, 0);
});
test('Legacy priority labels normalize together before validating group coherence', async () => {
  const f = fixture(); for (const i of [0,1]) { f.tasks[i].Priorities = '3'; f.times[i].Priorities = '3'; }
  const h = await harness(f); assert.equal(await h.api.correctTaskPriorities(), 2); assert.equal(h.data().times[1].Priorities, '3.متوسط');
});
test('Injected write failure rolls back the SQL double, including prior member writes', async () => {
  const f = fixture(), h = await harness(f, { failWrite: 3 }); await assert.rejects(h.api.rescheduleTasks(), /injected/); assert.deepEqual(h.data(), f); assert.equal(h.stats().rollbacks, 1);
});
test('Version touch failure rolls back the SQL double after schedule writes', async () => {
  const f = fixture(), h = await harness(f, { staleTouch: true }); await assert.rejects(h.api.rescheduleTasks(), code('GROUP_CHANGED')); assert.deepEqual(h.data(), f);
});
test('Lock contention or missing schema fail closed before writes', async () => {
  for (const [options, ready, wanted] of [[{busy:true},true,'GROUP_BUSY'],[{},false,'TASK_GROUPS_NOT_READY']]) { const f = fixture(); f.ready=ready; const h = await harness(f,options); await assert.rejects(h.api.rescheduleTasks(),code(wanted)); assert.equal(h.writes.length,0); }
});
test('Duplicate timedate rows or incomplete current membership reject planning before writes', async () => {
  for (const variant of ['duplicate','missing']) { const f=fixture(); if(variant==='duplicate') f.times.push({...f.times[0],TimeDateID:50}); else f.tasks=f.tasks.filter(r=>r.TaskID!==2); const h=await harness(f); await assert.rejects(h.api.rescheduleTasks(),code(variant==='duplicate'?'MULTIPLE_SCHEDULE_ROWS':'INCOMPLETE_GROUP')); assert.equal(h.writes.length,0); }
});
test('No-group scheduler uses legacy serial scheduling on the transaction executor', async () => {
  const h = await harness(fixture(false)); assert.equal(await h.api.rescheduleTasks(),3); assert.equal(h.data().times[0].DueDateTime,'2026-10-26 08:10:00'); assert.equal(h.data().times[1].DueDateTime,'2026-10-26 09:10:00'); assert.equal(h.data().times[2].DueDateTime,'2026-10-26 10:10:00');
});
test('No-group manual fixed save preserves legacy result and transaction', async () => {
  const h=await harness(fixture(false)); const r=await h.api.saveTaskSchedule({taskId:1,priority:FIXED,startLocal:'2026-10-26 10:00:00',endLocal:'2026-10-26 11:00:00'}); assert.equal(r.success,true); assert.equal(r.due,'2026-10-26 10:00:00'); assert.equal(h.stats().commits,1);
});
test('No-group secondary route receives only the transaction executor', async () => {
  const h=await harness(fixture(false)); let called=false; assert.equal(await h.api.updateTaskSchedule(async tx=>{called=true;return (await tx('SELECT TaskID, Priorities FROM Tsk_tbl ORDER BY DueDateTime')).length;}),3); assert.equal(called,true);
  const g=await harness(); await g.api.updateTaskSchedule(()=>{throw Error('wrong legacy path');});
});
test('No-group priority normalizer and automatic increase use legacy-compatible audit', async () => {
  const f=fixture(false); f.tasks[0].Priorities='3'; f.times[0].Priorities='3'; f.tasks[0].Submit_Date='2026-10-01 08:00:00'; const h=await harness(f); assert.equal(await h.api.correctTaskPriorities(),1); assert.equal(await h.api.increaseTaskPriorities(),1); assert.equal(h.data().follows.length,1); assert.equal(h.data().batches.length,0);
});
test('Malformed input rejects before SQL and unknown failures never disclose SQL text', async () => {
  const h=await harness(); for (const body of [{taskId:1,priority:'bad'},{taskId:1,priority:'3.متوسط',hours:-1},{taskId:1,priority:FIXED,startLocal:'bad',endLocal:'bad'}]) await assert.rejects(h.api.saveTaskSchedule(body)); assert.equal(h.calls.length,0);
  await assert.rejects(h.api.moveFixedTaskSchedules(0.5),code('INVALID_SHIFT')); const failure=h.api.schedulerFailure(Error('secret SQL')); assert.equal(failure.status,500); assert.ok(!JSON.stringify(failure).includes('secret'));
});
test('No-group manual non-fixed save and fixed shifting retain transactional legacy behavior', async () => {
  const h=await harness(fixture(false)); const r=await h.api.saveTaskSchedule({taskId:1,priority:'2.بالا',hours:1,minutes:0}); assert.equal(r.success,true); assert.equal(h.data().times[0].Priorities,'2.بالا');
  const f=fixture(false); Object.assign(f.tasks[0],{Priorities:FIXED,FixedDueTime:1}); Object.assign(f.times[0],{Priorities:FIXED,FixedDueTime:1,DueDateTime:new Date('2026-10-26T08:00:00Z'),EndDateTime:new Date('2026-10-26T09:00:00Z')}); const k=await harness(f); await k.api.moveFixedTaskSchedules(30); assert.equal(k.data().times[0].DueDateTime,'2026-10-26 08:30:00');
});
test('Every SQL placeholder remains paired with a parameter',async()=>{
  const h=await harness(); await h.api.saveTaskSchedule({taskId:1,priority:'2.بالا',hours:1,expectedGroupVersion:version}); for(const call of h.calls)assert.equal((call.sql.match(/\?/g)||[]).length,call.params.length,call.sql);
});
