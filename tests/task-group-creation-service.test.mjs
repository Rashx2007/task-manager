// Real service, planner and group helpers; SQL and transactions are doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const REQUEST = '11111111-1111-4111-8111-111111111111';
const REQUEST2 = '22222222-2222-4222-8222-222222222222';
const V = '0000000000000001';
const selected = extra => ({ selectedTaskIds: [202, 101], referenceTaskId: 101, ...extra });
const row = TaskID => ({TaskID, Priorities:'3.متوسط', FixedDueTime:0, Durationtime:'00:05:00', DueDateTime:'2026-11-01 12:15:00', EndDateTime:'2026-11-01 12:20:00'});
const fixture = () => ({ tasks:[101,202].map(id => ({...row(id), Complited:0, Descriptions:'keep', Finish_DateTime:'keep'})), times:[101,202].map(id => ({...row(id), RowKey:String(id+1)})), members:[], groups:[], operations:[], follows:[{TaskID:101, FollowID:1, Description:'keep'}], history:[{HistoryID:'12'}], serial:0, ready:true, migration:true, constraints:true });
const code = c => error => error.code === c;
async function setup(initial = fixture(), opts = {}) {
  let state = structuredClone(initial), writes = 0, commits = 0, rollbacks = 0; const calls = [];
  const tx = async (sql, params = []) => {
    const tag = sql.match(/\/\* group-create:([\w-]+) \*\//)?.[1]; calls.push({sql,params,tag});
    if (/\b(?:INSERT INTO|UPDATE dbo\.)/.test(sql)) { writes++; if (opts.failWrite === writes) throw Error('private SQL error'); }
    if (sql.includes('sp_getapplock')) return [{LockResult:opts.busy ? -1 : 0}];
    if (sql.includes('AS Ready')) return [{Ready:state.ready ? 1 : 0}];
    if (sql.includes('SELECT MigrationKey')) return state.migration ? [{MigrationKey:params[0]}] : [];
    if (sql.includes('AS IndexCount')) return [{IndexCount:state.constraints ? 2 : 1, ForeignKeyCount:7}];
    if (tag === 'operation') return state.operations.filter(r => r.RequestID === params[0]);
    if (tag === 'task') return state.tasks.filter(r => r.TaskID === params[0]);
    if (tag === 'time') return state.times.filter(r => r.TaskID === params[0]);
    if (tag === 'membership') return state.members.filter(r => r.TaskID === params[0]);
    if (tag === 'new-group') { const group={GroupID:++state.serial,Title:params[0],Version:V};state.groups.push(group);return opts.emptyTag === tag ? [] : [group]; }
    if (tag === 'new-member') { const member={MemberID:String(state.members.length+1),GroupID:params[0],TaskID:params[1],SyncEnabled:params[2],LeftAt:null,MemberVersion:V};state.members.push(member);return opts.emptyTag === tag ? [] : [member]; }
    if (tag === 'remember') { const receipt={RequestID:params[0],GroupID:params[1],OperationKind:params[2],PayloadHash:params[3],ResultJSON:params[4]};state.operations.push(receipt);return opts.emptyTag === tag ? [] : [receipt]; }
    throw Error('Unhandled SQL: '+sql);
  };
  const db = { runTransaction: async fn => { const before=structuredClone(state);try{const r=await fn(tx);commits++;return r;}catch(e){state=before;rollbacks++;throw e;} } };
  const context = vm.createContext({Date}); const modules = new Map();
  const synthetic = (key, values) => { if (!modules.has(key)) modules.set(key,new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context,identifier:key}));return modules.get(key); };
  async function module(file) { if(modules.has(file))return modules.get(file);const promise=fs.readFile(file,'utf8').then(source=>new vm.SourceTextModule(source,{context,identifier:file}));modules.set(file,promise);return promise; }
  const entry=await module(path.join(root,'lib/task-group-creation-service.js'));
  await entry.link((specifier,ref)=>{
    if(specifier==='server-only')return synthetic(specifier,{});
    if(specifier==='node:crypto')return synthetic(specifier,{createHash});
    let file=path.resolve(path.dirname(ref.identifier),specifier);if(!path.extname(file))file+='.js';
    if(file===path.join(root,'lib/db.js'))return synthetic(file,db);
    return module(file);
  }); await entry.evaluate();
  return { api:entry.namespace, calls, state:()=>state, stats:()=>({writes,commits,rollbacks}) };
}
async function prepared(h, extra={}) { const preview=await h.api.previewGroupCreation(selected());return { ...selected(), title:'گروه آزمایشی', requestId:REQUEST, expectedPreviewHash:preview.previewHash, ...extra }; }

test('preview is read-only and creates a valid stable fingerprint',async()=>{const h=await setup(),before=structuredClone(h.state()),r=await h.api.previewGroupCreation(selected());assert.equal(r.ready,true);assert.match(r.previewHash,/^[0-9a-f]{64}$/);assert.deepEqual(h.state(),before);assert.equal(h.stats().writes,0);assert.equal((await h.api.previewGroupCreation(selected({selectedTaskIds:[101,202]}))).previewHash,r.previewHash);});
test('identical schedules create group, exact members and receipt in one transaction',async()=>{const h=await setup(),p=await prepared(h),before=structuredClone(h.state()),r=await h.api.createTaskGroup(p);assert.equal(r.groupId,1);assert.equal(r.groupVersion,V);assert.equal(r.replayed,false);assert.deepEqual(Array.from(r.selectedTaskIds),[101,202]);assert.equal(h.state().groups.length,1);assert.deepEqual(h.state().members.map(m=>[m.GroupID,m.TaskID,m.SyncEnabled]),[[1,101,1],[1,202,1]]);assert.equal(h.state().operations.length,1);for(const k of ['tasks','times','follows','history'])assert.deepEqual(h.state()[k],before[k]);});
test('preview and create use global lock and ordered same-connection row reads',async()=>{const h=await setup(),p=await prepared(h);h.calls.length=0;await h.api.createTaskGroup(p);assert.equal(h.calls[0].params[0],'task-manager:schedule');assert.deepEqual(h.calls.filter(c=>c.tag==='task').map(c=>c.params[0]),[101,202]);assert.deepEqual(h.calls.filter(c=>c.tag==='membership').map(c=>c.params[0]),[101,202]);assert.ok(h.calls.findIndex(c=>c.tag==='operation')<h.calls.findIndex(c=>c.tag==='task'));});
test('same request replays without new writes despite later membership changes',async()=>{const h=await setup(),p=await prepared(h),a=await h.api.createTaskGroup(p),before=structuredClone(h.state()),n=h.stats().writes,b=await h.api.createTaskGroup(p);assert.equal(b.replayed,true);assert.equal(a.groupId,b.groupId);assert.deepEqual(h.state(),before);assert.equal(h.stats().writes,n);});
test('same request ID and different title, reference or selected IDs is rejected',async()=>{for(const extra of [{title:'different'},{referenceTaskId:202},{expectedPreviewHash:'f'.repeat(64)}]){const h=await setup(),p=await prepared(h);await h.api.createTaskGroup(p);const before=structuredClone(h.state());await assert.rejects(h.api.createTaskGroup({...p,...extra}),code('REQUEST_ID_REUSED'));assert.deepEqual(h.state(),before);}});
test('new request with already-grouped members is blocked',async()=>{const h=await setup(),p=await prepared(h);await h.api.createTaskGroup(p);await assert.rejects(h.api.createTaskGroup({...p,requestId:REQUEST2}),code('GROUP_CREATION_BLOCKED'));assert.equal(h.state().groups.length,1);});
test('schedule changes after preview reject stale fingerprint with no writes',async()=>{const h=await setup(),p=await prepared(h);for(const r of [h.state().tasks[0],h.state().times[0]]){r.DueDateTime='2026-11-01 13:15:00';r.EndDateTime='2026-11-01 13:20:00';}await assert.rejects(h.api.createTaskGroup(p),code('GROUP_PREVIEW_CHANGED'));assert.equal(h.state().groups.length,0);});
test('schedule row replacement is detected even when values match',async()=>{const h=await setup(),p=await prepared(h);h.state().times[0].RowKey='999';await assert.rejects(h.api.createTaskGroup(p),code('GROUP_PREVIEW_CHANGED'));});
test('enter-and-leave membership transition after preview is detected',async()=>{const h=await setup(),p=await prepared(h);h.state().members.push({MemberID:'9007199254740993',GroupID:9,TaskID:101,LeftAt:'past',MemberVersion:'0000000000000002'});await assert.rejects(h.api.createTaskGroup(p),code('GROUP_PREVIEW_CHANGED'));assert.equal(h.state().groups.length,0);});
test('different schedules are previewed but creation cannot implicitly align them',async()=>{const f=fixture();for(const r of [f.tasks[1],f.times[1]]){r.DueDateTime='2026-11-01 13:15:00';r.EndDateTime='2026-11-01 13:20:00';}const h=await setup(f),p=await prepared(h),before=structuredClone(h.state());assert.equal((await h.api.previewGroupCreation(selected())).proposal.requiresScheduleConfirmation,true);await assert.rejects(h.api.createTaskGroup(p),code('SCHEDULE_ALIGNMENT_NOT_SUPPORTED'));assert.deepEqual(h.state(),before);});
test('member joined after preview, task completion, or missing schedule block creation',async()=>{for(const mutate of [s=>s.members.push({MemberID:'4',GroupID:2,TaskID:101,LeftAt:null,MemberVersion:V}),s=>s.tasks[0].Complited=1,s=>s.times.shift()]){const h=await setup(),p=await prepared(h);mutate(h.state());await assert.rejects(h.api.createTaskGroup(p),code('GROUP_CREATION_BLOCKED'));assert.equal(h.state().groups.length,0);}});
test('blocked preview has no fingerprint and creates nothing',async()=>{const f=fixture();f.tasks[0].Complited=1;const h=await setup(f),r=await h.api.previewGroupCreation(selected());assert.equal(r.ready,false);assert.equal(r.previewHash,null);assert.equal(h.stats().writes,0);});
test('invalid inputs fail before opening a transaction',async()=>{for(const body of [selected({selectedTaskIds:[101]}),selected({selectedTaskIds:[101,101]}),selected({referenceTaskId:999}),null]){const h=await setup();await assert.rejects(h.api.previewGroupCreation(body));assert.equal(h.calls.length,0);}for(const extra of [{title:''},{title:'x'.repeat(201)},{requestId:'bad'},{expectedPreviewHash:'bad'}]){const h=await setup(),p={...selected(),title:'ok',requestId:REQUEST,expectedPreviewHash:'a'.repeat(64),...extra};await assert.rejects(h.api.createTaskGroup(p));assert.equal(h.calls.length,0);}});
test('missing schema, unavailable lock, and missing selected task fail safely',async()=>{for(const mode of ['schema','busy','task']){const f=fixture();if(mode==='schema')f.ready=false;if(mode==='task')f.tasks.shift();const h=await setup(f,{busy:mode==='busy'});await assert.rejects(h.api.previewGroupCreation(selected()));assert.equal(h.stats().writes,0);}});
test('every insertion failure rolls back group, all memberships and receipt',async()=>{for(let n=1;n<=4;n++){const f=fixture(),h=await setup(f,{failWrite:n}),p=await prepared(h);await assert.rejects(h.api.createTaskGroup(p));assert.deepEqual(h.state(),f);assert.equal(h.stats().rollbacks,1);}});
test('missing outputs on group, member, receipt roll back all writes',async()=>{for(const tag of ['new-group','new-member','remember']){const f=fixture(),h=await setup(f,{emptyTag:tag}),p=await prepared(h);await assert.rejects(h.api.createTaskGroup(p));assert.deepEqual(h.state(),f);}});
test('corrupt cached receipts are never returned as successful',async()=>{for(const corrupt of [r=>r.ResultJSON='bad',r=>{const j=JSON.parse(r.ResultJSON);j.groupId=999;r.ResultJSON=JSON.stringify(j);},r=>{const j=JSON.parse(r.ResultJSON);j.selectedTaskIds=[101];r.ResultJSON=JSON.stringify(j);}]){const h=await setup(),p=await prepared(h);await h.api.createTaskGroup(p);corrupt(h.state().operations[0]);await assert.rejects(h.api.createTaskGroup(p),code('OPERATION_RESULT_INVALID'));}});
test('row and membership identities are validated without bigint precision loss',async()=>{for(const mutate of [s=>s.times[0].RowKey='0',s=>s.members.push({MemberID:'not-id',GroupID:2,TaskID:101,LeftAt:'past',MemberVersion:V}),s=>s.members.push({MemberID:'99',GroupID:2,TaskID:101,LeftAt:'past',MemberVersion:'bad'})]){const f=fixture();mutate(f);const h=await setup(f);await assert.rejects(h.api.previewGroupCreation(selected()));assert.equal(h.stats().writes,0);}});
test('all values are bound; only group/member/receipt tables are written',async()=>{const h=await setup(),p=await prepared(h);await h.api.createTaskGroup(p);for(const c of h.calls){assert.equal((c.sql.match(/\?/g)||[]).length,c.params.length);if(/INSERT INTO/i.test(c.sql))assert.match(c.sql,/INSERT INTO dbo\.TaskGroup(?:\s|Member\s|Operation\s)/);assert.ok(!/UPDATE|DELETE/i.test(c.sql.replace(/UPDLOCK/g,'')));}});
test('import does not automatically access DB or create a group',async()=>{const h=await setup();assert.equal(h.calls.length,0);assert.equal(h.state().groups.length,0);});
